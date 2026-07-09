import { describe, it, expect } from "vitest";
import { buildThemeBoardViewModel, buildReplayBoardViewModel, type BoardViewModel } from "./boardViewModel.js";
import type { DaySummary, DailySnapshot } from "../api/daySummary.js";
import type { ReplayStock } from "../api/dayReplay.js";
import type { ReplayBoardSettings } from "../store/workbench.js";
import type { BoardFilterExpr } from "@trade-data-manager/market/domain";
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

const empty: BoardFilterExpr = { groups: [] };

/** 그룹 구조 무관하게 뷰모델의 모든 종목을 평탄화(테마카드 + 개별 + 미분류). */
function allStocks(vm: BoardViewModel): BoardStock[] {
    const out: BoardStock[] = [];
    for (const g of vm.grouped.themes) out.push(...g.stocks);
    out.push(...vm.grouped.individuals, ...vm.grouped.unclassified);
    return out;
}

describe("buildThemeBoardViewModel", () => {
    it("필터 없음 — metric 유효 종목 전부, dim 없음", () => {
        const vm = buildThemeBoardViewModel(
            summary([
                snap({ stockCode: "A", themes: [{ theme: "T" }], highPct: 20 }),
                snap({ stockCode: "B", themes: [{ theme: "T" }], highPct: 5 }),
            ]),
            new Set<string>(),
            empty,
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
            new Set<string>(),
            empty,
        );
        expect(allStocks(vm).map((s) => s.code)).toEqual(["A"]);
    });

    it("배제 필터 hide — 매칭 종목 제외", () => {
        const filter: BoardFilterExpr = { groups: [{ predicates: [{ kind: "weakHigh", params: { ltPct: 10 } }], mode: "hide" }] };
        const vm = buildThemeBoardViewModel(
            summary([
                snap({ stockCode: "A", themes: [{ theme: "T" }], highPct: 20 }),
                snap({ stockCode: "B", themes: [{ theme: "T" }], highPct: 5 }), // 약세 → hide
            ]),
            new Set<string>(),
            filter,
        );
        expect(allStocks(vm).map((s) => s.code)).toEqual(["A"]);
    });

    it("배제 필터 dim — 매칭 종목 dim + 사유(excludedBy)", () => {
        const filter: BoardFilterExpr = { groups: [{ predicates: [{ kind: "weakHigh", params: { ltPct: 10 } }], mode: "dim" }] };
        const vm = buildThemeBoardViewModel(
            summary([
                snap({ stockCode: "A", themes: [{ theme: "T" }], highPct: 20 }),
                snap({ stockCode: "B", themes: [{ theme: "T" }], highPct: 5 }),
            ]),
            new Set<string>(),
            filter,
        );
        const byCode = new Map(allStocks(vm).map((s) => [s.code, s]));
        expect(byCode.get("A")?.dim).toBe(false);
        expect(byCode.get("B")?.dim).toBe(true);
        expect(byCode.get("B")?.excludedBy).toEqual(["고가 등락률"]);
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
    minuteOpen: [0, 1],
    minuteHigh: [1, 6],
    trailingHighs: [],
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
        const vm = buildReplayBoardViewModel(index, 200, rs, new Set<string>(), empty);
        const codes = allStocks(vm).map((s) => s.code);
        expect(codes).toContain("A");
        expect(codes).not.toContain("B");
        expect(allStocks(vm).find((s) => s.code === "A")?.changeRate).toBe(9);
    });

    it("annotatedCodes 에 든 종목만 annotated=true", () => {
        const index = new Map<string, ReplayStock>([["A", rstock("A", { rate: [1, 9], cumAmount: [10, 100] })]]);
        const vm = buildReplayBoardViewModel(index, 200, { amountN: 1, rateN: 1 }, new Set(["A"]), empty);
        expect(allStocks(vm).find((s) => s.code === "A")?.annotated).toBe(true);
    });

    it("buckets — 시점 t 까지 분봉 거래대금 구간 누적(서버 EOD 와 같은 정책, 창만 [0..t])", () => {
        // 분봉1: 거래대금 50억(구간 idx2), 비음봉(close 5 ≥ open 1) → 카운트. minuteOfDay 09:0x → 시간창 안.
        const index = new Map<string, ReplayStock>([
            ["A", rstock("A", { times: [100, 160], rate: [1, 5], minuteOpen: [0, 1], minuteHigh: [1, 6], cumAmount: [0, 50 * EOK] })],
        ]);
        const rs: ReplayBoardSettings = { amountN: 5, rateN: 5 };
        // t=100 → 분봉0 까지(거래대금 0, 구간 없음) → 전부 0
        const at100 = buildReplayBoardViewModel(index, 100, rs, new Set(), empty);
        expect(allStocks(at100).find((s) => s.code === "A")?.buckets).toEqual([0, 0, 0, 0, 0, 0, 0]);
        // t=200 → 분봉1 포함(50억) → idx2 에 +1
        const at200 = buildReplayBoardViewModel(index, 200, rs, new Set(), empty);
        expect(allStocks(at200).find((s) => s.code === "A")?.buckets).toEqual([0, 0, 1, 0, 0, 0, 0]);
    });

    it("복기 필터 hide — 시점 t 스냅샷 지표에 매칭되면 제외", () => {
        // weakHigh: 시점 highPct(=high[i]) < ltPct 면 제외. t=200 → A highPct=6, B highPct=2.
        const index = new Map<string, ReplayStock>([
            ["A", rstock("A", { high: [1, 6], rate: [1, 5], cumAmount: [10, 100] })],
            ["B", rstock("B", { high: [1, 2], rate: [1, 2], cumAmount: [10, 90] })],
        ]);
        const rs: ReplayBoardSettings = { amountN: 5, rateN: 5 };
        const filter: BoardFilterExpr = { groups: [{ predicates: [{ kind: "weakHigh", params: { ltPct: 5 } }], mode: "hide" }] };
        const vm = buildReplayBoardViewModel(index, 200, rs, new Set(), filter);
        const codes = allStocks(vm).map((s) => s.code);
        expect(codes).toContain("A"); // highPct 6 ≥ 5 → 유지
        expect(codes).not.toContain("B"); // highPct 2 < 5 → hide
    });
});
