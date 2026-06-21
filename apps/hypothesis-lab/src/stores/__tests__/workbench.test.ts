import { beforeEach, describe, expect, it } from "vitest";
import { defaultRange, removeRefFromExpr, tabKeyOf, useWorkbench } from "@/stores/workbench";

beforeEach(() => {
    useWorkbench.setState({
        filterMode: "workingset",
        mode: { kind: "review-range", ...defaultRange() },
        range: defaultRange(),
        view: "all",
        sheetTab: undefined,
        expr: "",
        searchMode: false,
        searchQuery: "",
        settingsOpen: false,
        historyModalOpen: false,
        savedFilterModal: null,
        history: [],
        historyMax: 50,
        positions: {},
        _lastInsert: null,
    });
});

describe("useWorkbench", () => {
    it("가설 코드 삽입 시 불리언 모드로 전환하고 빈 식에서는 코드와 NOT을 순환한다", () => {
        const s = useWorkbench.getState();

        s.appendOrCycleRef("H0001");
        expect(useWorkbench.getState()).toMatchObject({
            filterMode: "boolean",
            expr: "H0001",
        });

        useWorkbench.getState().appendOrCycleRef("H0001");
        expect(useWorkbench.getState().expr).toBe("!H0001");

        useWorkbench.getState().appendOrCycleRef("H0001");
        expect(useWorkbench.getState().expr).toBe("");
    });

    it("같은 가설을 연속 삽입하면 연결 연산자와 NOT 조합을 순환한다", () => {
        const s = useWorkbench.getState();

        s.setExpr("H0001");
        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 & H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 | H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 & !H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001 | !H0002");

        useWorkbench.getState().appendOrCycleRef("H0002");
        expect(useWorkbench.getState().expr).toBe("H0001");
    });

    it("수동으로 식을 수정하면 직전 삽입 순환을 끊는다", () => {
        const s = useWorkbench.getState();

        s.appendOrCycleRef("H0001");
        useWorkbench.getState().setExpr("H0001 & H0002");
        useWorkbench.getState().appendOrCycleRef("H0001");

        expect(useWorkbench.getState().expr).toBe("H0001 & H0002 & H0001");
    });

    it("설정 모달과 저장 필터 모달 상태를 열고 닫는다", () => {
        const s = useWorkbench.getState();

        s.openSettings();
        expect(useWorkbench.getState().settingsOpen).toBe(true);
        useWorkbench.getState().closeSettings();
        expect(useWorkbench.getState().settingsOpen).toBe(false);

        useWorkbench.getState().openSavedFilter("save");
        expect(useWorkbench.getState().savedFilterModal).toBe("save");
        useWorkbench.getState().closeSavedFilter();
        expect(useWorkbench.getState().savedFilterModal).toBeNull();
    });

    it("History 는 최신순으로 쌓이고 중복은 앞으로 이동한다", () => {
        const s = useWorkbench.getState();
        s.addHistory("A-2026-06-01");
        s.addHistory("B-2026-06-02");
        s.addHistory("A-2026-06-01"); // 중복 → 앞으로
        expect(useWorkbench.getState().history).toEqual(["A-2026-06-01", "B-2026-06-02"]);
    });

    it("History 는 historyMax 로 캡되고 max 축소 시 잘린다", () => {
        useWorkbench.setState({ historyMax: 2 });
        const s = useWorkbench.getState();
        s.addHistory("A-2026-06-01");
        s.addHistory("B-2026-06-02");
        s.addHistory("C-2026-06-03");
        expect(useWorkbench.getState().history).toEqual(["C-2026-06-03", "B-2026-06-02"]);

        useWorkbench.getState().setHistoryMax(1);
        expect(useWorkbench.getState().history).toEqual(["C-2026-06-03"]);
    });

    it("기간/시트 설정은 해당 탭이 활성일 때만 active mode 에 반영된다", () => {
        const s = useWorkbench.getState();
        // 기간 탭 활성 → 기간 변경이 mode 에 반영
        s.setRange({ from: "2025-01-01", to: "2025-01-31" });
        expect(useWorkbench.getState().mode).toEqual({
            kind: "review-range",
            from: "2025-01-01",
            to: "2025-01-31",
        });

        // 시트 탭이 비활성(현재 기간)이면 시트탭 변경은 mode 에 반영 안 됨
        useWorkbench.getState().setSheetTab("내탭");
        expect(useWorkbench.getState().mode).toEqual({
            kind: "review-range",
            from: "2025-01-01",
            to: "2025-01-31",
        });
        expect(useWorkbench.getState().sheetTab).toBe("내탭");

        // 시트 탭으로 전환 후 시트탭 변경은 반영
        useWorkbench.getState().selectWorkingSet({ kind: "sheet", tab: "내탭" });
        useWorkbench.getState().setSheetTab("다른탭");
        expect(useWorkbench.getState().mode).toEqual({ kind: "sheet", tab: "다른탭" });
    });

    it("setView 는 All/Todo/Done 뷰를 전환한다", () => {
        useWorkbench.getState().setView("todo");
        expect(useWorkbench.getState().view).toBe("todo");
        useWorkbench.getState().setView("done");
        expect(useWorkbench.getState().view).toBe("done");
    });

    it("가설 검색 모드와 검색어를 전환한다", () => {
        useWorkbench.getState().setSearchMode(true);
        useWorkbench.getState().setSearchQuery("삼성 #급등");
        expect(useWorkbench.getState()).toMatchObject({
            searchMode: true,
            searchQuery: "삼성 #급등",
        });

        useWorkbench.getState().setSearchMode(false);
        expect(useWorkbench.getState().searchMode).toBe(false);
    });

    it("removeRef 는 코드 참조를 앞 연산자까지 지우고 불리언 모드로 둔다", () => {
        useWorkbench.setState({ filterMode: "workingset", expr: "H0001 & H0002" });
        useWorkbench.getState().removeRef("H0002");
        expect(useWorkbench.getState()).toMatchObject({ filterMode: "boolean", expr: "H0001" });

        // 맨 앞 토큰은 뒤 연산자를 지우고, 뒤 항의 부정은 보존
        useWorkbench.setState({ expr: "H0001 & !H0002" });
        useWorkbench.getState().removeRef("H0001");
        expect(useWorkbench.getState().expr).toBe("!H0002");
    });

    it("tabKeyOf 는 workingset 은 소스별, 그 외는 filterMode 로 키를 만든다", () => {
        expect(
            tabKeyOf("workingset", { kind: "review-range", from: "2026-06-01", to: "2026-06-30" }),
        ).toBe("ws:review-range");
        expect(tabKeyOf("workingset", { kind: "sheet" })).toBe("ws:sheet");
        expect(tabKeyOf("history", { kind: "snapshot" })).toBe("history");
        expect(tabKeyOf("boolean", { kind: "snapshot" })).toBe("boolean");
    });
});

describe("removeRefFromExpr", () => {
    it("중간/끝 토큰은 앞 연산자(부정 포함)와 함께 제거한다", () => {
        expect(removeRefFromExpr("H0001 & H0002 | H0003", "H0002")).toBe("H0001 | H0003");
        expect(removeRefFromExpr("H0001 | !H0002", "H0002")).toBe("H0001");
        expect(removeRefFromExpr("H0001 & H0002", "H0002")).toBe("H0001");
    });

    it("맨 앞 토큰은 뒤 연산자를 지우고 다음 항의 부정은 남긴다", () => {
        expect(removeRefFromExpr("H0001 & H0002", "H0001")).toBe("H0002");
        expect(removeRefFromExpr("!H0001 & !H0002", "H0001")).toBe("!H0002");
    });

    it("단독 토큰은 자신만 지워 빈 식이 된다", () => {
        expect(removeRefFromExpr("H0001", "H0001")).toBe("");
        expect(removeRefFromExpr("!H0001", "H0001")).toBe("");
    });

    it("부분 일치 코드는 건드리지 않고, 없는 코드는 식을 그대로 둔다", () => {
        expect(removeRefFromExpr("H0001 & H00012", "H0001")).toBe("H00012");
        expect(removeRefFromExpr("H0001 & H0002", "H0009")).toBe("H0001 & H0002");
    });
});
