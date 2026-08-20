// 작업셋 모수 확장 — **curation 흔적이 있는 날 전부**가 올라오는가, 3상 필터가 그걸 거르는가.
//
// 왜 이걸 잠그나: 이번 개편의 목적이 정확히 "골격만/그룹만/코멘트만 있는 날의 등재"다. 옛 모수
// (기준선 ∪ 타점)로 조용히 되돌아가는 회귀는 화면이 그냥 짧아질 뿐이라 눈으로 못 잡는다 — 목록의
// 다섯 출처(기준선·골격·타점·그룹·코멘트)가 각각 **혼자서도** 행을 만든다는 것을 못박는다.
import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders, type Seed } from "../../test/renderPanel.js";
import { WorksetPanel } from "../WorksetPanel.js";

const SEED: Seed = {
    // 앵커 — 골격만 찍은 날(A) / 기준선만 그은 날(B). param 이 곧 출처다.
    anchors: [
        { stockCode: "AAAAA", date: "2026-08-05", param: "skeleton", anchorDate: "2026-08-04", field: "high", market: "un" },
        { stockCode: "BBBBB", date: "2026-08-06", param: "baseline", anchorDate: "2026-08-01", field: "low", market: "un" },
    ],
    // 타점만 있는 날(C).
    points: [{ stockCode: "CCCCC", date: "2026-08-07", time: "09:30:00", name: null }],
    // 그룹만 담은 날(D) — 하루 소속(time 없음).
    memberships: [{ stockCode: "DDDDD", date: "2026-08-04", groupNames: ["후보"] }],
    // 코멘트만 남긴 날(E).
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

describe("작업셋 — 존재 지도 모수와 3상 필터", () => {
    beforeEach(() => localStorage.clear()); // 영속 필터(wb.workset.presenceFilter)가 테스트를 건너 새면 안 된다

    it("다섯 출처가 각각 혼자서도 행을 만든다 — 골격만/그룹만/코멘트만 있는 날 포함", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        for (const name of ALL) expect(screen.getByText(name)).toBeTruthy();
    });

    it("칩 1클릭 = 있는 날만 — '골격'을 켜면 골격 찍은 날만 남고 숨김 수가 보인다", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        fireEvent.click(screen.getByRole("button", { name: "골격" }));
        expect(screen.getByText("골격만")).toBeTruthy();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.queryByText(name)).toBeNull();
        expect(screen.getByText("4 숨김")).toBeTruthy();
    });

    it("칩 2클릭 = 없는 날만(!) — 골격 없는 날 넷이 남는다, 3클릭 = 해제", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        fireEvent.click(screen.getByRole("button", { name: "골격" })); // 무관 → 있음
        fireEvent.click(screen.getByRole("button", { name: "골격" })); // 있음 → 없음(라벨이 !골격 으로)
        expect(screen.queryByText("골격만")).toBeNull();
        for (const name of ALL.filter((n) => n !== "골격만")) expect(screen.getByText(name)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "!골격" })); // 3번째 = 무관으로 복귀
        for (const name of ALL) expect(screen.getByText(name)).toBeTruthy();
    });

    it("켜진 칩은 AND — '타점 있음 ∧ 그룹 없음'과 '해제 ⤺' 복귀", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        fireEvent.click(screen.getByRole("button", { name: "타점" }));
        fireEvent.click(screen.getByRole("button", { name: "그룹" }));
        fireEvent.click(screen.getByRole("button", { name: "그룹" })); // has → not
        expect(screen.getByText("타점만")).toBeTruthy();
        expect(screen.queryByText("그룹만")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "해제 ⤺" }));
        for (const name of ALL) expect(screen.getByText(name)).toBeTruthy();
    });

    it("종목 행에 존재 배지가 붙는다 — 종류가 아이콘으로 선다", () => {
        renderWithProviders(<WorksetPanel />, SEED);
        // 배지는 그림이라 글자로 못 찾는다 — 종류 손잡이(data-presence-kind)와 aria-label 로 확인한다.
        const row = screen.getByText("골격만").closest("button");
        expect(row?.querySelector("[data-presence-kind='skeleton']")).toBeTruthy();
        expect(row?.querySelector("[data-presence-kind='comment']")).toBeNull();
        const commentRow = screen.getByText("코멘트만").closest("button");
        expect(commentRow?.querySelector("[data-presence-kind='comment']")).toBeTruthy();
        expect(screen.getAllByLabelText("코멘트").length).toBeGreaterThan(0);
    });
});
