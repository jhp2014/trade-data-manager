import { describe, it, expect } from "vitest";
import { computeRowDerived, rowKey } from "../filter/derived";
import type { FilterInstance } from "../filter/kinds/types";
import type { ThemeRowData, StockMetricsDTO, DeckEntryDTO } from "@/types/deck";

function metric(stockCode: string, closeRate: number | null): StockMetricsDTO {
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

function row(stockCode: string, selfRate: number, peers: StockMetricsDTO[]): ThemeRowData {
    return {
        entry: entry(stockCode),
        self: metric(stockCode, selfRate),
        themeId: "theme-A",
        themeName: "테마A",
        selfRank: 1,
        themeSize: peers.length + 1,
        peers,
        allThemesForEntry: [{ themeId: "theme-A", themeName: "테마A" }],
    };
}

// 빈 conditions 배열 predicate는 항상 true → 모든 멤버가 풀에 포함됨
const ALWAYS_TRUE_INSTANCE: FilterInstance = {
    id: "inst-1",
    kind: "activeMembersInTheme",
    value: { predicate: { conditions: [] } },
};

describe("computeRowDerived", () => {
    it("인스턴스 0개면 activePools는 빈 배열", () => {
        const r = row("AAA", 5, [metric("BBB", 3)]);
        const map = computeRowDerived([r], []);
        expect(map.get(rowKey(r))!.activePools).toEqual([]);
    });

    it("전체 매칭 predicate에서 self와 peers가 등락률 내림차순으로 정렬되고 selfRank가 계산된다", () => {
        const r = row("AAA", 5, [metric("BBB", 10), metric("CCC", 3)]);
        const map = computeRowDerived([r], [ALWAYS_TRUE_INSTANCE]);

        const pool = map.get(rowKey(r))!.activePools[0];
        expect(pool.poolSize).toBe(3);
        expect(pool.members.map((m) => m.stockCode)).toEqual(["BBB", "AAA", "CCC"]);
        expect(pool.selfRank).toBe(2);
        expect(pool.instanceId).toBe("inst-1");
    });

    it("closeRate가 null인 멤버는 정렬 최하위로 간다", () => {
        const r = row("AAA", 5, [metric("BBB", null), metric("CCC", 10)]);
        const map = computeRowDerived([r], [ALWAYS_TRUE_INSTANCE]);

        const pool = map.get(rowKey(r))!.activePools[0];
        expect(pool.members.map((m) => m.stockCode)).toEqual(["CCC", "AAA", "BBB"]);
    });

    it("여러 row를 각각 독립적으로 계산한다", () => {
        const r1 = row("AAA", 5, [metric("BBB", 10)]);
        const r2 = row("XXX", 7, [metric("YYY", 1)]);
        const map = computeRowDerived([r1, r2], [ALWAYS_TRUE_INSTANCE]);

        expect(map.size).toBe(2);
        expect(map.get(rowKey(r1))!.activePools[0].selfRank).toBe(2);
        expect(map.get(rowKey(r2))!.activePools[0].selfRank).toBe(1);
    });

    it("여러 인스턴스마다 activePools 항목이 1개씩 생성된다", () => {
        const inst2: FilterInstance = {
            id: "inst-2",
            kind: "activeMembersInTheme",
            value: { predicate: { conditions: [] } },
        };
        const r = row("AAA", 5, [metric("BBB", 10)]);
        const map = computeRowDerived([r], [ALWAYS_TRUE_INSTANCE, inst2]);

        const pools = map.get(rowKey(r))!.activePools;
        expect(pools).toHaveLength(2);
        expect(pools.map((p) => p.instanceId)).toEqual(["inst-1", "inst-2"]);
    });
});
