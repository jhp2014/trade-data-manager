import { describe, it, expect } from "vitest";
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { unionGrain, unionOf, uniqueCounts, type UnionPart } from "../assembly.js";

const day = (code: string, date: string): FunnelItem => ({ stockCode: code, date });
const pt = (code: string, date: string, time: string): FunnelItem => ({ stockCode: code, date, time });

// 부품 A 정의의 타점: (1, 07-01) 에 둘 · 부품 B 정의의 타점: (1, 07-01) 에 하나뿐 — **자기 정의로 전개**의 관찰창.
const timesA = (i: { stockCode: string; date: string }): string[] =>
    i.stockCode === "1" && i.date === "2026-07-01" ? ["09:30:00", "10:00:00"] : [];
const timesB = (i: { stockCode: string; date: string }): string[] =>
    i.stockCode === "1" && i.date === "2026-07-01" ? ["09:30:00"] : [];

const keyOf = (i: FunnelItem): string => `${i.stockCode}|${i.date}${i.time ? "|" + i.time : ""}`;

describe("unionOf — 평평한 OR", () => {
    it("전부 day 면 day 로 합치고 funnelKey 로 접는다", () => {
        const parts: UnionPart[] = [
            { grain: "day", items: [day("1", "2026-07-01"), day("2", "2026-07-02")], timesOf: timesA },
            { grain: "day", items: [day("2", "2026-07-02"), day("3", "2026-07-03")], timesOf: timesB },
        ];
        const u = unionOf(parts);
        expect(u.grain).toBe("day");
        expect(u.items.map(keyOf)).toEqual(["1|2026-07-01", "2|2026-07-02", "3|2026-07-03"]);
    });

    it("point 부품이 섞이면 point 로 내리고, day 부품의 전개는 **그 부품의 timesOf** 로 한다", () => {
        const parts: UnionPart[] = [
            { grain: "day", items: [day("1", "2026-07-01")], timesOf: timesA }, // 자기 정의: 타점 둘
            { grain: "point", items: [pt("1", "2026-07-01", "09:30:00")], timesOf: timesB },
        ];
        const u = unionOf(parts);
        expect(u.grain).toBe("point");
        // A 정의 전개(09:30·10:00) ∪ B 의 타점(09:30, 중복 접힘) — B 정의로 전개했다면 10:00 이 없었을 것.
        expect(u.items.map(keyOf)).toEqual(["1|2026-07-01|09:30:00", "1|2026-07-01|10:00:00"]);
    });

    it("타점 0인 하루는 point 합집합에서 대표가 없다(전개 규칙의 결손 그대로)", () => {
        const parts: UnionPart[] = [
            { grain: "day", items: [day("9", "2026-07-09")], timesOf: () => [] },
            { grain: "point", items: [pt("1", "2026-07-01", "09:30:00")], timesOf: timesB },
        ];
        expect(unionOf(parts).items.map(keyOf)).toEqual(["1|2026-07-01|09:30:00"]);
    });

    it("부품 0개(빈 조립·전부 꺼짐)는 빈 day 집합", () => {
        expect(unionOf([])).toEqual({ grain: "day", items: [] });
        expect(unionGrain([])).toBe("day");
    });
});

describe("uniqueCounts — 부품별 고유 기여", () => {
    it("겹치는 항목은 어느 부품의 고유도 아니다", () => {
        const counts = uniqueCounts([
            new Set(["a", "b", "c"]),
            new Set(["b", "d"]),
        ]);
        expect(counts).toEqual([2, 1]); // a·c 는 0번만, d 는 1번만, b 는 둘 다라 어느 쪽도 아님
    });

    it("완전히 같은 두 부품은 고유 기여 0", () => {
        expect(uniqueCounts([new Set(["a"]), new Set(["a"])])).toEqual([0, 0]);
    });

    it("빈 목록·빈 집합", () => {
        expect(uniqueCounts([])).toEqual([]);
        expect(uniqueCounts([new Set(), new Set(["x"])])).toEqual([0, 1]);
    });
});
