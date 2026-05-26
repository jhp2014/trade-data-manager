import { describe, it, expect } from "vitest";
import { applyFilters } from "../filter/applyFilters";
import { rowKey } from "../filter/derived";
import type {
    FilterInstance,
    FilterKind,
    RowDerived,
} from "../filter/kinds/types";
import type { ThemeRowData, StockMetricsDTO, DeckEntryDTO } from "@/types/deck";

function metric(stockCode: string, closeRate: number | null = 0): StockMetricsDTO {
    return {
        stockCode,
        stockName: stockCode,
        closeRate,
        cumulativeAmount: null,
        dayHighRate: null,
        pullbackFromHigh: null,
        minutesSinceDayHigh: null,
        amountDistribution: null,
        amountDistributionBucket: null,
    };
}

function entry(stockCode: string): DeckEntryDTO {
    return {
        stockCode,
        tradeDate: "2026-05-11",
        tradeTime: "09:00:00",
        options: {},
        priceLines: {},
        sourceFile: "test.csv",
    };
}

function row(stockCode: string, closeRate = 0): ThemeRowData {
    return {
        entry: entry(stockCode),
        self: metric(stockCode, closeRate),
        themeId: "T",
        themeName: "T",
        selfRank: 1,
        themeSize: 1,
        peers: [],
        allThemesForEntry: [{ themeId: "T", themeName: "T" }],
    };
}

// 최소 FilterKind 모킹 (테스트에서 사용 안 하는 필드는 unknown 캐스팅)
function mockKind(name: string, predicate: (row: ThemeRowData, value: unknown) => boolean): FilterKind<unknown> {
    return {
        kind: name,
        label: name,
        section: "theme",
        multiple: true,
        defaultValue: () => null,
        chipLabel: () => name,
        match: (row, value) => predicate(row, value),
        Input: (() => null) as unknown as FilterKind<unknown>["Input"],
        serialize: () => "",
        deserialize: () => null,
    };
}

describe("applyFilters", () => {
    const rows = [row("AAA", 5), row("BBB", -3), row("CCC", 10)];

    it("인스턴스가 비어 있으면 입력을 그대로 반환", () => {
        const out = applyFilters(rows, [], new Map(), {});
        expect(out).toBe(rows);
    });

    it("등록되지 않은 kind는 통과시킨다 (필터 무시)", () => {
        const insts: FilterInstance[] = [{ id: "x", kind: "unknown", value: null }];
        const out = applyFilters(rows, insts, new Map(), {});
        expect(out).toEqual(rows);
    });

    it("단일 필터: closeRate > 0인 row만 통과", () => {
        const kinds = {
            positiveRate: mockKind("positiveRate", (r) => (r.self.closeRate ?? 0) > 0),
        };
        const insts: FilterInstance[] = [{ id: "1", kind: "positiveRate", value: null }];
        const out = applyFilters(rows, insts, new Map(), kinds);
        expect(out.map((r) => r.self.stockCode)).toEqual(["AAA", "CCC"]);
    });

    it("복수 필터는 AND로 결합된다", () => {
        const kinds = {
            positiveRate: mockKind("positiveRate", (r) => (r.self.closeRate ?? 0) > 0),
            highRate: mockKind("highRate", (r) => (r.self.closeRate ?? 0) >= 10),
        };
        const insts: FilterInstance[] = [
            { id: "1", kind: "positiveRate", value: null },
            { id: "2", kind: "highRate", value: null },
        ];
        const out = applyFilters(rows, insts, new Map(), kinds);
        expect(out.map((r) => r.self.stockCode)).toEqual(["CCC"]);
    });

    it("derivedMap에 키가 없으면 EMPTY_DERIVED를 전달한다", () => {
        let captured: RowDerived | null = null;
        const kinds = {
            spy: mockKind("spy", (_row) => true),
        };
        // match 시그니처상 derived를 받지만 위 mockKind는 무시 — 직접 등록
        kinds.spy = {
            ...kinds.spy,
            match: (_row, _value, derived) => {
                captured = derived;
                return true;
            },
        };
        const insts: FilterInstance[] = [{ id: "1", kind: "spy", value: null }];
        applyFilters([row("AAA")], insts, new Map(), kinds);

        expect(captured).toEqual({ activePools: [] });
    });

    it("derivedMap에 키가 있으면 해당 derived가 전달된다", () => {
        const r = row("AAA");
        const derived: RowDerived = {
            activePools: [{ instanceId: "p1", selfRank: 2, poolSize: 5, members: [] }],
        };
        const map = new Map<string, RowDerived>([[rowKey(r), derived]]);

        let captured: RowDerived | null = null;
        const kinds = {
            check: {
                ...mockKind("check", () => true),
                match: (_row: ThemeRowData, _value: unknown, d: RowDerived) => {
                    captured = d;
                    return true;
                },
            },
        };
        const insts: FilterInstance[] = [{ id: "1", kind: "check", value: null }];
        applyFilters([r], insts, map, kinds);

        expect(captured).toEqual(derived);
    });
});
