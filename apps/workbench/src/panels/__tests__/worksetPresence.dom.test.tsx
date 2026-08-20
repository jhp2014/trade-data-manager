// 작업셋 E안 — 모수(흔적 전부)·DNF 필터(필터 안 AND, 필터 사이 OR)·집합 팝오버(전역 포인터)를 잠근다.
//
// 왜 이걸 잠그나: ① 옛 모수(기준선∪타점)로 조용히 돌아가는 회귀는 화면이 짧아질 뿐이라 눈으로 못
// 잡는다 — 다섯 출처가 각각 혼자서도 행을 만든다는 것을 못박는다. ② DNF 는 "특정 상황을 모아 놓고
// 작업"하는 도구라 편집 손짓(+ 필터 팝오버·프리셋·3상 순환·✕)이 곧 계약이다. ③ 집합 선택은 **전역**
// 포인터를 움직인다(연동 패널 구독) — 로컬 상태로 퇴행하면 "작업셋 = 집합 선택의 집" 그림이 깨진다.
import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
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

/** "+ 필터" → 종류 팝오버에서 고르기 — 새 필터가 그 종류 has 로 생긴다. */
const addFilterWith = (kind: string): void => {
    fireEvent.click(screen.getByRole("button", { name: "+ 필터" }));
    fireEvent.click(screen.getByRole("button", { name: kind }));
};

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

    it("필터가 없을 때의 + 필터 팝오버에는 프리셋이 함께 선다 — 채우러 갈 날 원클릭", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        fireEvent.click(screen.getByRole("button", { name: "+ 필터" }));
        expect(screen.getByText("프리셋")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "골격 채울 날" })); // = !골격
        expect(screen.queryByText("골격만")).toBeNull();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.getByText(name)).toBeTruthy();
        // 필터가 이미 있으면 프리셋 섹션은 안 선다(종류만).
        fireEvent.click(screen.getByRole("button", { name: "+ 필터" }));
        expect(screen.queryByText("프리셋")).toBeNull();
    });

    it("필터 하나(골격 has) — 골격 찍은 날만 남고 숨김 수가 선다", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        expect(screen.getByText("골격만")).toBeTruthy();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.queryByText(name)).toBeNull();
        expect(screen.getByText("1 표시 · 4 숨김")).toBeTruthy();
    });

    it("필터 안 칩 순환 — has 클릭 = !not(취소선), 다시 클릭 = 제거(빈 필터는 평가 제외)", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        fireEvent.click(screen.getByRole("button", { name: "골격" })); // has → not
        expect(screen.queryByText("골격만")).toBeNull();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.getByText(name)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "!골격" })); // not → 제거
        expect(screen.getByText("빈 필터")).toBeTruthy(); // 껍데기는 남고(✕로만 소멸) 평가에선 빠진다
        for (const name of ALL) expect(screen.getByText(name)).toBeTruthy();
    });

    it("필터 두 개 = OR — [골격] ∨ [코멘트] 는 두 날을 함께 남긴다, ✕는 그 필터만 삭제", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        addFilterWith("골격");
        addFilterWith("코멘트");
        expect(screen.getByText("|")).toBeTruthy(); // 필터 사이 구분자 = | (AND 는 칩 사이 &)
        expect(screen.getByText("골격만")).toBeTruthy();
        expect(screen.getByText("코멘트만")).toBeTruthy();
        expect(screen.queryByText("타점만")).toBeNull();
        expect(screen.getByText("2 표시 · 3 숨김")).toBeTruthy();
        fireEvent.click(screen.getAllByRole("button", { name: "✕" })[0]!); // 첫 필터(골격) 삭제
        expect(screen.queryByText("골격만")).toBeNull(); // 남은 필터 = 코멘트
        expect(screen.getByText("코멘트만")).toBeTruthy();
    });

    it("집합 칩 → 팝오버에서 고르면 **전역 선택 포인터**가 움직인다 — 연동 패널이 구독하는 그 값", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        const openPicker = (): boolean =>
            fireEvent.click(screen.getByTitle("클릭 = 집합 고르기 — 고르면 연동된 패널들이 함께 따라간다"));
        openPicker();
        fireEvent.click(screen.getByRole("button", { name: "최종 생존" }));
        expect(useWorkbench.getState().selectedSetRef).toEqual({ kind: "survivors" });
        openPicker();
        // 월 줄에도 "전체" 칩이 있다 — 집합 팝오버의 전체는 title 이 없는 쪽이다.
        fireEvent.click(screen.getAllByRole("button", { name: "전체" }).find((b) => !b.getAttribute("title"))!);
        expect(useWorkbench.getState().selectedSetRef).toBeNull();
    });

    it("종목 행에 존재 배지가 아이콘으로 선다(숫자 없음 — 상세는 hover 툴팁)", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        const row = screen.getByText("골격만").closest("button");
        expect(row?.querySelector("[data-presence-kind='skeleton']")).toBeTruthy();
        expect(row?.querySelector("[data-presence-kind='comment']")).toBeNull();
        // 그룹명은 hover 색 카드로 — 화면(행)에 이름 칩이 서지 않고, 아이콘에 올리면 즉시 카드가 뜬다.
        const groupRow = screen.getByText("그룹만").closest("button");
        const groupBadge = groupRow?.querySelector("[data-presence-kind='group']");
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
