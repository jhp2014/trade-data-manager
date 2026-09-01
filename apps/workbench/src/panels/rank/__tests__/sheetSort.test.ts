import { describe, it, expect } from "vitest";
import {
    DEFAULT_CHAIN, buildSheetGroups, cutGroupIdx, cutsActive, dropSort, parseSortChain, pushSort, resetSort,
    resolveCutKeys, sortSheetRows, sortStepNo, type SortChain, type SortCtx,
} from "../sheetSort.js";
import type { SheetRow } from "../rankSheet.js";
import type { RankCell } from "../../../lib/rankIndex.js";

// 축 셀 하나 — rank(강=1)와 orderKey(큼=강)는 서로 반대 방향이라 둘 다 명시한다.
const cell = (rank: number, total: number, orderKey: number): RankCell =>
    ({ rank, total, frac: total <= 1 ? 0.5 : (total - rank) / (total - 1), orderKey });

const row = (code: string, over: Partial<SheetRow> & { ax?: RankCell | null } = {}): SheetRow => {
    const { ax, ...rest } = over;
    return {
        stockCode: code, date: "2026-07-01", time: "10:00:00",
        cells: { A: ax ?? null }, ...rest,
    };
};

const ctx: SortCtx = { nameOf: (c) => `${c}명` };
const codes = (rows: SheetRow[]): string[] => rows.map((r) => r.stockCode);
const AX: SortChain = [{ key: { kind: "axis", axisId: "A" }, dir: 1 }];

describe("체인 조작", () => {
    it("평클릭 = 그 열 하나로 리셋, 단독 1차면 방향만 뒤집는다.", () => {
        const chain = resetSort(DEFAULT_CHAIN, { kind: "name" });
        expect(chain).toEqual([{ key: { kind: "name" }, dir: -1 }]);
        expect(resetSort(chain, { kind: "name" })[0].dir).toBe(1);
        // 2단 체인에서 1차를 평클릭 = 방향 유지한 채 리셋(2차가 사라지는 게 곧 '리셋')
        const two = pushSort(chain, { kind: "date" });
        expect(resetSort(two, { kind: "name" })).toEqual([{ key: { kind: "name" }, dir: -1 }]);
    });

    it("Shift+클릭 = 단 추가, 이미 있으면 그 단의 방향만 뒤집는다(다른 단 불변).", () => {
        const chain = pushSort(DEFAULT_CHAIN, { kind: "axis", axisId: "A" });
        expect(sortStepNo(chain, { kind: "axis", axisId: "A" })).toBe(2);
        expect(chain[1].dir).toBe(1); // 축 첫 방향 = 강 먼저
        const flipped = pushSort(chain, { kind: "axis", axisId: "A" });
        expect(flipped.length).toBe(2);
        expect(flipped[1].dir).toBe(-1);
        expect(flipped[0]).toEqual(chain[0]);
    });

    it("빼기 — 마지막 한 단은 못 뺀다(기본 체인으로).", () => {
        const chain = pushSort(DEFAULT_CHAIN, { kind: "name" });
        expect(dropSort(chain, { kind: "name" })).toEqual(DEFAULT_CHAIN);
        expect(dropSort(DEFAULT_CHAIN, { kind: "date" })).toEqual(DEFAULT_CHAIN);
    });

    it("영속 복원 — 옛 단일 정렬 객체도 1단 체인으로 받는다.", () => {
        expect(parseSortChain({ key: { kind: "date" }, dir: -1 })).toEqual(DEFAULT_CHAIN);
        expect(parseSortChain([{ key: { kind: "axis", axisId: "A" }, dir: 1 }])).toEqual(AX);
        expect(parseSortChain([{ key: { kind: "axis" }, dir: 1 }])).toBeNull(); // axisId 없음
        expect(parseSortChain([])).toBeNull();
        expect(parseSortChain("nope")).toBeNull();
    });
});

describe("정렬 체인", () => {
    it("2차는 1차 동률 안에서만 순서를 바꾼다.", () => {
        const rows = [ // B·C 는 같은 slot(동률), A 는 더 강함
            row("A", { ax: cell(1, 2, 20) }),
            row("B", { ax: cell(2, 2, 10), date: "2026-07-01" }),
            row("C", { ax: cell(2, 2, 10), date: "2026-07-05" }),
        ];
        const byDateAsc = sortSheetRows(rows, [...AX, { key: { kind: "date" }, dir: 1 }], ctx);
        expect(codes(byDateAsc)).toEqual(["A", "B", "C"]);
        const byDateDesc = sortSheetRows(rows, [...AX, { key: { kind: "date" }, dir: -1 }], ctx);
        expect(codes(byDateDesc)).toEqual(["A", "C", "B"]); // A 는 절대 안 밀린다
    });

    it("값 없음(미배치)은 방향을 뒤집어도 바닥, 그 안은 2차 키로 정렬된다.", () => {
        const rows = [
            row("U1", { ax: null, date: "2026-07-09" }),
            row("P", { ax: cell(1, 1, 10) }),
            row("U2", { ax: null, date: "2026-07-02" }),
        ];
        const chain: SortChain = [...AX, { key: { kind: "date" }, dir: 1 }];
        expect(codes(sortSheetRows(rows, chain, ctx))).toEqual(["P", "U2", "U1"]);
        const rev: SortChain = [{ key: { kind: "axis", axisId: "A" }, dir: -1 }, { key: { kind: "date" }, dir: 1 }];
        expect(codes(sortSheetRows(rows, rev, ctx))).toEqual(["P", "U2", "U1"]);
    });

    it("암묵 폴백(날짜↓·종목↑·시간↑) — 사용자 체인이 전부 동률이어도 순서가 결정된다.", () => {
        const rows = [
            row("B", { date: "2026-07-01", time: "11:00:00" }),
            row("A", { date: "2026-07-01", time: "09:00:00" }),
            row("C", { date: "2026-07-08", time: "09:00:00" }),
        ];
        expect(codes(sortSheetRows(rows, [{ key: { kind: "comment" }, dir: 1 }], ctx))).toEqual(["C", "A", "B"]);
    });
});

describe("그룹 컷", () => {
    // 강(orderKey 30) → 약(10). 컷은 "이 자리 바로 아래에서 끊는다" = 자기 자신은 위 그룹.
    const rows = [
        row("A", { ax: cell(1, 3, 30), date: "2026-07-01" }),
        row("B", { ax: cell(2, 3, 20), date: "2026-07-09" }),
        row("C", { ax: cell(3, 3, 10), date: "2026-07-05" }),
        row("U", { ax: null, date: "2026-07-03" }),
    ];

    it("컷 slotId → 경계 orderKey(강→약), 사라진 slot 은 조용히 버린다.", () => {
        const slotOrder = new Map([["s30", 30], ["s20", 20], ["s10", 10]]);
        expect(resolveCutKeys(["s10", "s30", "지워진슬롯"], slotOrder)).toEqual([30, 10]);
        expect(resolveCutKeys(["s30"], undefined)).toEqual([]);
    });

    it("컷 자리 자신은 위 그룹, 미배치는 그룹 없음(항상 바닥).", () => {
        expect(cutGroupIdx(rows[0], "A", [30])).toBe(0); // orderKey 30 = 컷 자리 → 위 그룹
        expect(cutGroupIdx(rows[1], "A", [30])).toBe(1);
        expect(cutGroupIdx(rows[3], "A", [30])).toBeNull();
        expect(cutsActive(AX, [])).toBe(false);
        expect(cutsActive([{ key: { kind: "date" }, dir: 1 }], [30])).toBe(false); // 1차가 축이어야
    });

    it("컷만 있고 2차가 없으면 컷 없는 축 정렬과 완전히 같다(= 배치 드래그가 살아 있는 이유).", () => {
        expect(codes(sortSheetRows(rows, AX, ctx, [20]))).toEqual(codes(sortSheetRows(rows, AX, ctx)));
    });

    it("컷 + 2차 = 그룹 순서는 1차, 그룹 안은 2차.", () => {
        // 컷 s20 아래 → 그룹0={A,B}, 그룹1={C}, 미배치={U}. 그룹0 안은 날짜 오름차순 → A(07-01) → B(07-09)
        const chain: SortChain = [...AX, { key: { kind: "date" }, dir: -1 }];
        expect(codes(sortSheetRows(rows, chain, ctx, [20]))).toEqual(["B", "A", "C", "U"]);
    });

    it("1차 방향을 뒤집으면 그룹 순서만 뒤집히고 미배치는 그대로 바닥.", () => {
        const chain: SortChain = [{ key: { kind: "axis", axisId: "A" }, dir: -1 }, { key: { kind: "date" }, dir: 1 }];
        expect(codes(sortSheetRows(rows, chain, ctx, [20]))).toEqual(["C", "A", "B", "U"]);
    });

    it("그룹 라벨 = 그 덩어리의 순위 범위, 미배치는 이름 그대로.", () => {
        const chain: SortChain = [...AX, { key: { kind: "date" }, dir: 1 }];
        const gs = buildSheetGroups(sortSheetRows(rows, chain, ctx, [20]), chain, ctx, [20]);
        expect(gs.map((g) => g.label)).toEqual(["1~2위", "3위", "미배치"]);
        expect(gs.map((g) => g.rows.length)).toEqual([2, 1, 1]);
    });
});

describe("그룹 접기", () => {
    it("이산 열(날짜)은 컷 없이도 저절로 그룹, 축은 컷 없으면 통짜.", () => {
        const rows = [
            row("A", { ax: cell(1, 2, 20), date: "2026-07-01" }),
            row("B", { ax: cell(2, 2, 10), date: "2026-07-01" }),
            row("C", { date: "2026-07-08" }),
        ];
        const byDate = buildSheetGroups(sortSheetRows(rows, DEFAULT_CHAIN, ctx), DEFAULT_CHAIN, ctx);
        expect(byDate.map((g) => g.label)).toEqual(["2026.07.08", "2026.07.01"]);

        const byAxis = buildSheetGroups(sortSheetRows(rows, AX, ctx), AX, ctx);
        expect(byAxis.length).toBe(1);
        expect(byAxis[0].label).toBeNull(); // 헤더 없음
    });

    it("이산 열의 값 없음도 한 그룹(바닥) — 날짜.", () => {
        const rows = [row("A", { date: "2026-07-01" }), row("B", { date: "2026-07-02" }), row("C", { date: "2026-07-01" })];
        const chain: SortChain = [{ key: { kind: "date" }, dir: 1 }];
        const gs = buildSheetGroups(sortSheetRows(rows, chain, ctx), chain, ctx);
        expect(gs.map((g) => g.label)).toEqual(["2026.07.01", "2026.07.02"]);
        expect(gs[0].rows.map((r) => r.stockCode)).toEqual(["A", "C"]);
    });
});
