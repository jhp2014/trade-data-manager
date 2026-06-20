import { beforeEach, describe, expect, it } from "vitest";
import { currentMonth, tabKeyOf, useWorkbench } from "@/stores/workbench";

beforeEach(() => {
    useWorkbench.setState({
        filterMode: "workingset",
        mode: { kind: "review-month", month: currentMonth() },
        month: currentMonth(),
        sheetTab: undefined,
        expr: "",
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

    it("월/시트 설정은 해당 탭이 활성일 때만 active mode 에 반영된다", () => {
        const s = useWorkbench.getState();
        // 월별 탭 활성 → 월 변경이 mode 에 반영
        s.setMonth("2025-01");
        expect(useWorkbench.getState().mode).toEqual({ kind: "review-month", month: "2025-01" });

        // 시트 탭이 비활성(현재 월별)이면 시트탭 변경은 mode 에 반영 안 됨
        useWorkbench.getState().setSheetTab("내탭");
        expect(useWorkbench.getState().mode).toEqual({ kind: "review-month", month: "2025-01" });
        expect(useWorkbench.getState().sheetTab).toBe("내탭");

        // 시트 탭으로 전환 후 시트탭 변경은 반영
        useWorkbench.getState().selectWorkingSet({ kind: "sheet", tab: "내탭" });
        useWorkbench.getState().setSheetTab("다른탭");
        expect(useWorkbench.getState().mode).toEqual({ kind: "sheet", tab: "다른탭" });
    });

    it("tabKeyOf 는 workingset 은 소스별, 그 외는 filterMode 로 키를 만든다", () => {
        expect(tabKeyOf("workingset", { kind: "review-month", month: "2026-06" })).toBe("ws:review-month");
        expect(tabKeyOf("workingset", { kind: "snapshot" })).toBe("ws:snapshot");
        expect(tabKeyOf("history", { kind: "snapshot" })).toBe("history");
        expect(tabKeyOf("boolean", { kind: "snapshot" })).toBe("boolean");
    });
});
