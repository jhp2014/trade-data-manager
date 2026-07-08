import { describe, it, expect } from "vitest";
import { buildThemeBoardViewModel, buildReplayBoardViewModel, type BoardViewModel } from "./boardViewModel.js";
import type { DaySummary, DailySnapshot } from "../api/daySummary.js";
import type { ReplayStock } from "../api/dayReplay.js";
import type { ThemeBoardSettings, ReplayBoardSettings } from "../store/workbench.js";
import type { BoardStock } from "../components/board/BoardCard.js";

const EOK = 1e8;

const snap = (over: Partial<DailySnapshot>): DailySnapshot => ({
    date: "2026-06-26",
    stockCode: "000000",
    name: null,
    market: null,
    changeRate: 3,
    openPct: 0,
    highPct: 3,
    lowPct: -1,
    amount: String(50 * EOK),
    marketCap: null,
    themes: [],
    comment: null,
    ...over,
});

const summary = (stocks: DailySnapshot[]): DaySummary => ({
    date: "2026-06-26",
    stockCount: stocks.length,
    themes: [],
    byTheme: {},
    stocks,
});

const noFilter: ThemeBoardSettings = {
    showIndividuals: true,
    showUnclassified: false,
    filterOn: false,
    filterHighGte: 10,
    filterAmountEok: 100,
    filterCombine: "and",
    filterMode: "hide",
    filterNewHigh: false,
    filterNewHighWindow: 20,
    filterNewHighTolerance: 2,
};

/** 그룹 구조 무관하게 뷰모델의 모든 종목을 평탄화(테마카드 + 개별 + 미분류). */
function allStocks(vm: BoardViewModel): BoardStock[] {
    const out: BoardStock[] = [];
    for (const g of vm.grouped.themes) out.push(...g.stocks);
    out.push(...vm.grouped.individuals, ...vm.grouped.unclassified);
    return out;
}

describe("buildThemeBoardViewModel", () => {
    it("필터 off — metric 유효 종목 전부, dim 없음", () => {
        const vm = buildThemeBoardViewModel(
            summary([
                snap({ stockCode: "A", themes: [{ theme: "T" }], highPct: 20 }),
                snap({ stockCode: "B", themes: [{ theme: "T" }], highPct: 5 }),
            ]),
            noFilter,
            new Set<string>(),
        );
        expect(allStocks(vm).map((s) => s.code).sort()).toEqual(["A", "B"]);
        expect(allStocks(vm).every((s) => !s.dim)).toBe(true);
    });

    it("metric 결손(일봉 미수집) 종목은 제외", () => {
        const vm = buildThemeBoardViewModel(
            summary([
                snap({ stockCode: "A", themes: [{ theme: "T" }] }),
                snap({ stockCode: "X", themes: [{ theme: "T" }], changeRate: null }), // dailyMetric → null
            ]),
            noFilter,
            new Set<string>(),
        );
        expect(allStocks(vm).map((s) => s.code)).toEqual(["A"]);
    });

    it("hide 모드 — 필터 미달 종목 제외", () => {
        const st: ThemeBoardSettings = { ...noFilter, filterOn: true, filterMode: "hide" };
        const vm = buildThemeBoardViewModel(
            summary([
                snap({ stockCode: "A", themes: [{ theme: "T" }], highPct: 20, amount: String(200 * EOK) }),
                snap({ stockCode: "B", themes: [{ theme: "T" }], highPct: 20, amount: String(200 * EOK) }),
                snap({ stockCode: "C", themes: [{ theme: "T" }], highPct: 5, amount: String(50 * EOK) }),
            ]),
            st,
            new Set<string>(),
        );
        expect(allStocks(vm).map((s) => s.code).sort()).toEqual(["A", "B"]);
    });

    it("dim 모드 — 미달 종목은 남되 dim=true", () => {
        const st: ThemeBoardSettings = { ...noFilter, filterOn: true, filterMode: "dim" };
        const vm = buildThemeBoardViewModel(
            summary([
                snap({ stockCode: "A", themes: [{ theme: "T" }], highPct: 20, amount: String(200 * EOK) }),
                snap({ stockCode: "B", themes: [{ theme: "T" }], highPct: 20, amount: String(200 * EOK) }),
                snap({ stockCode: "C", themes: [{ theme: "T" }], highPct: 5, amount: String(50 * EOK) }),
            ]),
            st,
            new Set<string>(),
        );
        const byCode = new Map(allStocks(vm).map((s) => [s.code, s]));
        expect(byCode.get("C")?.dim).toBe(true);
        expect(byCode.get("A")?.dim).toBe(false);
    });
});

const rstock = (code: string, over: Partial<ReplayStock>): ReplayStock => ({
    code,
    times: [100, 160],
    rate: [1, 5],
    high: [1, 6],
    low: [0, -1],
    open: 0,
    cumAmount: [10, 20],
    name: code,
    market: "KOSPI",
    marketCap: null,
    themes: ["T"],
    ...over,
});

describe("buildReplayBoardViewModel", () => {
    it("top-N 유니버스 선정 + 시점 스냅샷 반영", () => {
        const index = new Map<string, ReplayStock>([
            ["A", rstock("A", { rate: [1, 9], cumAmount: [10, 100] })],
            ["B", rstock("B", { rate: [1, 2], cumAmount: [10, 20] })],
        ]);
        const rs: ReplayBoardSettings = { amountN: 1, rateN: 1 };
        // t=200 → times[1]=160 이 마지막 ≤200. amount top1 = A(100), rate top1 = A(9) → hot = {A}
        const vm = buildReplayBoardViewModel(index, 200, rs, new Set<string>());
        const codes = allStocks(vm).map((s) => s.code);
        expect(codes).toContain("A");
        expect(codes).not.toContain("B");
        expect(allStocks(vm).find((s) => s.code === "A")?.changeRate).toBe(9);
    });

    it("annotatedCodes 에 든 종목만 annotated=true", () => {
        const index = new Map<string, ReplayStock>([["A", rstock("A", { rate: [1, 9], cumAmount: [10, 100] })]]);
        const vm = buildReplayBoardViewModel(index, 200, { amountN: 1, rateN: 1 }, new Set(["A"]));
        expect(allStocks(vm).find((s) => s.code === "A")?.annotated).toBe(true);
    });
});
