// 작업셋 — 모수(흔적 전부)·DNF 필터(필터 안 AND, 필터 사이 OR)·채널 줄 셋(월·필터·프리셋)을 잠근다.
//
// 왜 이걸 잠그나: ① 옛 모수(기준선∪타점)로 조용히 돌아가는 회귀는 화면이 짧아질 뿐이라 눈으로 못
// 잡는다 — 다섯 출처가 각각 혼자서도 행을 만든다는 것을 못박는다. ② DNF 는 "특정 상황을 모아 놓고
// 작업"하는 도구라 편집 손짓(+ 필터 팝오버·프리셋·좌클릭 반전·우클릭 삭제 메뉴)이 곧 계약이다. ③ 집합은 **읽기만**
// 한다(머리글 라벨) — 고르는 손은 집합 편성 패널 하나다(두 곳이면 어느 쪽이 조종석인지 흐려진다).
// ④ 프리셋에 닿는 길은 **화면에 하나뿐**이어야 한다(줄이 켜져 있으면 줄, 꺼져 있으면 + 필터 판).
import { describe, it, expect, beforeEach } from "vitest";
import { act, screen, fireEvent } from "@testing-library/react";
import { renderWithProviders, type Seed } from "../../test/renderPanel.js";
import { useWorkbench } from "../../store/workbench.js";
import { WorksetPanel } from "../WorksetPanel.js";

const SEED: Seed = {
    // 앵커 — 골격만 찍은 날(A) / 기준선만 그은 날(B). param 이 곧 출처다.
    anchors: [
        { stockCode: "AAAAA", date: "2026-08-05", param: "skeleton", anchorDate: "2026-08-04", field: "high", market: "un" },
        { stockCode: "BBBBB", date: "2026-08-06", param: "baseline", anchorDate: "2026-08-01", field: "low", market: "un" },
    ],
    points: [{ stockCode: "CCCCC", date: "2026-08-07", time: "09:30:00", name: null }],
    memberships: [{ stockCode: "DDDDD", date: "2026-08-04", groupNames: ["후보"] }],
    comments: [{ stockCode: "EEEEE", date: "2026-08-03", comment: "메모", author: "me" }],
    stockNames: [
        { stockCode: "AAAAA", name: "골격만", market: "거래소" },
        { stockCode: "BBBBB", name: "기준선만", market: "거래소" },
        { stockCode: "CCCCC", name: "타점만", market: "거래소" },
        { stockCode: "DDDDD", name: "그룹만", market: "거래소" },
        { stockCode: "EEEEE", name: "코멘트만", market: "거래소" },
    ],
};

const ALL = ["골격만", "기준선만", "타점만", "그룹만", "코멘트만"];

/** 채널 줄의 ⋯ — 후보 전부와 고정 손잡이를 든 판(줄에 다 서 있어도 늘 있다). */
const openList = (label: string): HTMLElement => screen.getByTitle(new RegExp(`^${label} 전부 보기`));

/** "+ 필터" → 종류 팝오버에서 고르기 — 새 필터가 그 종류 has 로 생긴다. */
const addFilterWith = (kind: string): void => {
    fireEvent.click(screen.getByRole("button", { name: "+ 필터" }));
    fireEvent.click(screen.getByRole("button", { name: kind }));
};

/** 필터 안 ＋ → 그 필터에 종류 하나 더(AND). */
const andKind = (ti: number, kind: string): void => {
    fireEvent.click(screen.getAllByTitle("이 필터에 종류 추가(AND)")[ti]!);
    fireEvent.click(screen.getByRole("button", { name: kind }));
};

/** 칩 우클릭 = 편집 메뉴(지우기 · 이 필터 지우기). 삭제가 사는 유일한 자리다. */
const chipMenu = (chip: string): void => { fireEvent.contextMenu(screen.getByRole("button", { name: chip })); };

describe("작업셋 E안 — 모수·DNF·집합", () => {
    beforeEach(() => {
        localStorage.clear(); // 영속(필터 DNF·좁히기·헤더 핀)이 테스트를 건너 새면 안 된다
        useWorkbench.setState({ selectedSetRef: null, savedSets: [] });
    });

    it("다섯 출처가 각각 혼자서도 행을 만든다 — 골격만/그룹만/코멘트만 있는 날 포함", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        for (const name of ALL) expect(screen.getByText(name)).toBeTruthy();
        expect(screen.getByText("5 표시")).toBeTruthy();
    });

    it("프리셋 줄 — 칩 클릭 = 필터 통째 교체, 다시 누르면 해제", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        fireEvent.click(screen.getByRole("button", { name: "골격 채울 날" })); // = !골격
        expect(useWorkbench.getState().gazePresence).toEqual([{ skeleton: "not" }]);
        expect(screen.queryByText("골격만")).toBeNull();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.getByText(name)).toBeTruthy();

        // 다른 프리셋을 누르면 **교체**다(OR 로 쌓이지 않는다) — 식이 늘 절 하나로 유지된다.
        fireEvent.click(screen.getByRole("button", { name: "타점 찍을 날" }));
        expect(useWorkbench.getState().gazePresence).toEqual([{ point: "not" }]);

        fireEvent.click(screen.getByRole("button", { name: "타점 찍을 날" })); // 같은 것 재클릭 = 해제
        expect(useWorkbench.getState().gazePresence).toEqual([]);
    });

    it("프리셋에 닿는 길은 하나 — 줄이 켜져 있으면 + 필터 판에는 안 선다", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        // 프리셋 칩은 줄에 이미 서 있다. 판이 또 들면 같은 이름의 버튼이 둘이 된다 — 그게 이 검사의 눈이다.
        expect(screen.getAllByRole("button", { name: "골격 채울 날" })).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "+ 필터" }));
        expect(screen.getAllByRole("button", { name: "골격 채울 날" })).toHaveLength(1);
        expect(screen.getByRole("button", { name: "골격" })).toBeTruthy(); // 판 안에는 종류만
    });

    it("필터 하나(골격 has) — 골격 찍은 날만 남고 숨김 수가 선다", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        expect(screen.getByText("골격만")).toBeTruthy();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.queryByText(name)).toBeNull();
        expect(screen.getByText("1 표시 · 4 숨김")).toBeTruthy();
    });

    it("칩 좌클릭은 **반전만** — 아무리 눌러도 칩이 사라지지 않는다(삭제는 우클릭의 몫)", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        fireEvent.click(screen.getByRole("button", { name: "골격" })); // has → not
        expect(screen.queryByText("골격만")).toBeNull();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.getByText(name)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "!골격" })); // not → has (제거 아님)
        expect(useWorkbench.getState().gazePresence).toEqual([{ skeleton: "has" }]);
        expect(screen.getByRole("button", { name: "골격" })).toBeTruthy();
    });

    it("칩 우클릭 → 지우기 — 절의 마지막 칩이면 필터도 함께 사라진다(빈 필터가 안 남는다)", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        chipMenu("골격");
        expect(screen.queryByRole("button", { name: "이 필터 지우기" })).toBeNull(); // 1칩이면 "지우기"와 같은 일이라 안 선다
        fireEvent.click(screen.getByRole("button", { name: "지우기" }));
        expect(useWorkbench.getState().gazePresence).toEqual([]);
        expect(screen.queryByText("빈 필터")).toBeNull();
        for (const name of ALL) expect(screen.getByText(name)).toBeTruthy();
    });

    it("칩 2개짜리 필터 — 지우기는 칩만, 이 필터 지우기는 묶음째", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        andKind(0, "타점");
        expect(useWorkbench.getState().gazePresence).toEqual([{ skeleton: "has", point: "has" }]);

        chipMenu("타점");
        fireEvent.click(screen.getByRole("button", { name: "지우기" })); // 칩만 — 필터는 산다
        expect(useWorkbench.getState().gazePresence).toEqual([{ skeleton: "has" }]);

        andKind(0, "타점");
        chipMenu("골격");
        fireEvent.click(screen.getByRole("button", { name: "이 필터 지우기" })); // 묶음째
        expect(useWorkbench.getState().gazePresence).toEqual([]);
    });

    it("필터 두 개 = OR — [골격] ∨ [코멘트] 는 두 날을 함께 남긴다, 삭제는 그 필터만", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        addFilterWith("코멘트");
        expect(screen.getByText("|")).toBeTruthy(); // 필터 사이 구분자 = | (AND 는 칩 사이 &)
        expect(screen.getByText("골격만")).toBeTruthy();
        expect(screen.getByText("코멘트만")).toBeTruthy();
        expect(screen.queryByText("타점만")).toBeNull();
        expect(screen.getByText("2 표시 · 3 숨김")).toBeTruthy();
        chipMenu("골격");
        fireEvent.click(screen.getByRole("button", { name: "지우기" })); // 첫 필터(골격) 삭제
        expect(screen.queryByText("골격만")).toBeNull(); // 남은 필터 = 코멘트
        expect(screen.getByText("코멘트만")).toBeTruthy();
    });

    it("집합은 **읽기만** — 머리글 라벨이 보는 집합을 말하고, 고르는 칩은 이 패널에 없다(집합 편성의 몫)", () => {
        useWorkbench.setState({ savedSets: [{ id: "fs1", name: "돌파", stages: [], part: { kind: "survivors" } }] });
        renderWithProviders(<WorksetPanel />, SEED);
        expect(screen.getByTitle(/^지금 보는 집합: 연동/)).toBeTruthy();
        expect(screen.queryByTitle(/^유니버스/)).toBeNull(); // 집합 칩 줄이 없다(월 줄의 "전체"는 다른 채널)
        expect(screen.queryByTitle(/^집합 전부 보기/)).toBeNull();
        act(() => { useWorkbench.setState({ selectedSetRef: { kind: "saved", setId: "fs1" } }); });
        expect(screen.getByTitle(/^지금 보는 집합: 돌파/)).toBeTruthy();
    });

    it("고정 — 고르지 않아도 줄에 서고, **판에서도 안 사라진다**(해제하러 갈 자리가 그 판뿐이라) — 월 줄", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        expect(useWorkbench.getState().gazeMonths).toBeNull(); // 기본 = 전체
        expect(screen.queryByRole("button", { name: "26.08" })).toBeNull(); // 안 고른 달은 접힘 줄에 안 선다
        fireEvent.click(openList("월"));
        const pinBtn = (): HTMLElement => screen.getAllByRole("button", { name: "고정" })
            .find((b) => (b.title ?? "").startsWith("26.08 —"))!;

        fireEvent.click(pinBtn());
        // 줄(칩) + 판(행) 둘 다에 있다 — 판에서 사라지면 해제할 길이 없어진다.
        expect(screen.getAllByRole("button", { name: "26.08" })).toHaveLength(2);
        expect(pinBtn().getAttribute("aria-pressed")).toBe("true");
        expect(useWorkbench.getState().gazeMonths).toBeNull(); // 고정은 시선이 아니다

        fireEvent.click(pinBtn()); // 같은 손잡이로 해제
        expect(pinBtn().getAttribute("aria-pressed")).toBe("false");
        expect(screen.getAllByRole("button", { name: "26.08" })).toHaveLength(1); // 판에만 남는다
    });

    it("종목 행에 존재 배지가 아이콘으로 선다(숫자 없음 — 상세는 hover 툴팁)", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        const row = screen.getByText("골격만").closest("button");
        expect(row?.querySelector("[data-presence-kind='skeleton']")).toBeTruthy();
        expect(row?.querySelector("[data-presence-kind='comment']")).toBeNull();
        // 그룹명은 hover 색 카드로 — 화면(행)에 이름 칩이 서지 않고, 아이콘에 올리면 즉시 카드가 뜬다.
        const groupRow = screen.getByText("그룹만").closest("button");
        // 하루 소속(시각 없음)이라 배지도 하루 그룹 쪽 — 타점 그룹은 별개 종류다.
        const groupBadge = groupRow?.querySelector("[data-presence-kind='group-day']");
        expect(groupRow?.querySelector("[data-presence-kind='group-point']")).toBeNull();
        expect(groupBadge).toBeTruthy();
        expect(groupRow?.textContent).not.toContain("후보");
        fireEvent.mouseEnter(groupBadge!.parentElement!);
        expect(document.querySelector("[data-hover-card]")?.textContent).toContain("후보");
    });

    it("날짜 머리에 그 날 표시 항목 수가 선다", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        const divider = document.querySelector("[data-divider='2026-08-04']");
        expect(divider?.textContent).toContain("2026.08.04");
        expect(divider?.textContent).toContain("1"); // 그룹만(DDDDD) 하루
    });
});
