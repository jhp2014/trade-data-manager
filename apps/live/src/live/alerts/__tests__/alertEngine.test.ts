import { describe, it, expect } from "vitest";
import type { Quote } from "../../engine/types.js";
import { AlertEngine, type AlertEvalContext } from "../alertEngine.js";
import { computeThemeRanks, RankTracker } from "../themeRank.js";
import type { AlertRule } from "../types.js";

const quote = (code: string, price: number, tradeValue = 0): Quote => ({
    code,
    name: `${code}명`,
    price,
    changeRate: 1.5,
    volume: 0,
    base: 0,
    open: 0,
    high: 0,
    low: 0,
    marketCap: 0,
    tradeValue,
    ts: 0,
});

/** 시세 몇 개로 평가 컨텍스트 구성(순위는 옵션). */
function ctx(quotes: Quote[], ranks = new Map<string, Map<string, number>>(), rankAgo?: (c: string, t: string) => number | undefined): AlertEvalContext {
    const byCode = new Map(quotes.map((q) => [q.code, q]));
    return { quoteOf: (c) => byCode.get(c), ranks, rankAgo: rankAgo ?? (() => undefined) };
}

describe("AlertEngine — 가격 밴드", () => {
    const rule: AlertRule = { id: "r1", code: "005930", band: { baseline: 100, lowerPct: 5, upperPct: 10 } }; // [105,110]

    it("진입 엣지에만 발화 — 초기화 틱은 무장만, 밴드 안 유지는 재발화 없음", () => {
        const e = new AlertEngine();
        expect(e.evaluate([rule], ctx([quote("005930", 100)]), 0)).toHaveLength(0); // 초기화(밖)
        const fired = e.evaluate([rule], ctx([quote("005930", 106)]), 5_000); // 진입
        expect(fired).toHaveLength(1);
        expect(fired[0].features.baselinePct).toBeCloseTo(6);
        expect(e.evaluate([rule], ctx([quote("005930", 108)]), 10_000)).toHaveLength(0); // 안에서 유지
    });

    it("이미 밴드 안에서 룰 생성(초기화) → 즉시 발화 없음, 나갔다 재진입해야 발화", () => {
        const e = new AlertEngine();
        expect(e.evaluate([rule], ctx([quote("005930", 107)]), 0)).toHaveLength(0); // 초기화(안) — 발화 없음
        expect(e.evaluate([rule], ctx([quote("005930", 103)]), 5_000)).toHaveLength(0); // 하강(재무장)
        expect(e.evaluate([rule], ctx([quote("005930", 106)]), 10_000)).toHaveLength(1); // 재진입 → 발화
    });

    it("쿨다운 내 재진입은 억제(그 진입은 버림), 쿨다운 후 재진입은 발화", () => {
        const e = new AlertEngine();
        const r: AlertRule = { ...rule, cooldownMs: 60_000 };
        e.evaluate([r], ctx([quote("005930", 100)]), 0); // 초기화
        expect(e.evaluate([r], ctx([quote("005930", 106)]), 5_000)).toHaveLength(1); // 발화
        e.evaluate([r], ctx([quote("005930", 100)]), 10_000); // 이탈(재무장)
        expect(e.evaluate([r], ctx([quote("005930", 106)]), 20_000)).toHaveLength(0); // 쿨다운 내 재진입 — 억제
        e.evaluate([r], ctx([quote("005930", 100)]), 30_000); // 이탈
        expect(e.evaluate([r], ctx([quote("005930", 106)]), 70_000)).toHaveLength(1); // 쿨다운 경과 후 재진입
    });

    it("상단 무제한([+5,∞)) — 갭 관통도 잡고 / 유계([+5,+10]) — 밴드 너머 런어웨이는 패스", () => {
        const open: AlertRule = { id: "o", code: "005930", band: { baseline: 100, lowerPct: 5, upperPct: null } };
        const closed: AlertRule = { id: "c", code: "005930", band: { baseline: 100, lowerPct: 5, upperPct: 10 } };
        const e = new AlertEngine();
        e.evaluate([open, closed], ctx([quote("005930", 100)]), 0); // 초기화(둘 다 밖)
        const fired = e.evaluate([open, closed], ctx([quote("005930", 120)]), 5_000); // +20% 갭
        expect(fired.map((f) => f.ruleId)).toEqual(["o"]); // 무제한만 발화, 유계는 관통 패스
    });

    it("하단 무제한((-∞,-5]) — 급락 진입 잡기", () => {
        const r: AlertRule = { id: "dn", code: "005930", band: { baseline: 100, lowerPct: null, upperPct: -5 } };
        const e = new AlertEngine();
        e.evaluate([r], ctx([quote("005930", 100)]), 0);
        expect(e.evaluate([r], ctx([quote("005930", 90)]), 5_000)).toHaveLength(1);
    });

    it("시세 결손 틱은 상태 불변 — 결손이 가짜 재무장(재발화)을 만들지 않는다", () => {
        const e = new AlertEngine();
        e.evaluate([rule], ctx([quote("005930", 100)]), 0); // 초기화(밖)
        expect(e.evaluate([rule], ctx([quote("005930", 106)]), 5_000)).toHaveLength(1); // 진입 발화
        expect(e.evaluate([rule], ctx([]), 10_000)).toHaveLength(0); // 시세 결손 — 스킵
        expect(e.evaluate([rule], ctx([quote("005930", 107)]), 300_000)).toHaveLength(0); // 여전히 안 — 엣지 아님(쿨다운도 지났지만)
    });
});

describe("AlertEngine — 순위 룰", () => {
    it("reach: 순위가 K 이하로 내려온 엣지에 발화", () => {
        const r: AlertRule = { id: "rk", code: "A", rank: { theme: "HBM", mode: "reach", threshold: 1 } };
        const e = new AlertEngine();
        const ranksAt = (rank: number) => new Map([["A", new Map([["HBM", rank]])]]);
        e.evaluate([r], ctx([quote("A", 100)], ranksAt(2)), 0); // 초기화(2등)
        expect(e.evaluate([r], ctx([quote("A", 100)], ranksAt(1)), 5_000)).toHaveLength(1); // 1등 도달
        expect(e.evaluate([r], ctx([quote("A", 100)], ranksAt(1)), 10_000)).toHaveLength(0); // 유지 — 재발화 없음
    });

    it("delta: 60s 창 순위 상승 계단 ≥ D 에 발화, 이력 미적립이면 스킵", () => {
        const r: AlertRule = { id: "rd", code: "A", rank: { theme: "HBM", mode: "delta", threshold: 3 }, cooldownMs: 1 };
        const e = new AlertEngine();
        const ranksNow = new Map([["A", new Map([["HBM", 2]])]]);
        // 이력 없음 → 스킵(초기화도 안 됨)
        expect(e.evaluate([r], ctx([quote("A", 100)], ranksNow, () => undefined), 0)).toHaveLength(0);
        // past=6, now=2 → Δ=4 ≥ 3 이지만 첫 판정은 초기화 틱
        expect(e.evaluate([r], ctx([quote("A", 100)], ranksNow, () => 6), 5_000)).toHaveLength(0);
        // Δ 미달로 하강(재무장) 후 다시 Δ 충족 → 발화
        e.evaluate([r], ctx([quote("A", 100)], ranksNow, () => 3), 10_000); // Δ=1 < 3 → false
        const fired = e.evaluate([r], ctx([quote("A", 100)], ranksNow, () => 7), 15_000); // Δ=5 → true
        expect(fired).toHaveLength(1);
        expect(fired[0].features.themeRankDelta).toBe(5);
    });

    it("band AND rank — 둘 다 참이어야 발화", () => {
        const r: AlertRule = {
            id: "and",
            code: "A",
            band: { baseline: 100, lowerPct: 5, upperPct: null },
            rank: { theme: "HBM", mode: "reach", threshold: 1 },
        };
        const e = new AlertEngine();
        const ranksAt = (rank: number) => new Map([["A", new Map([["HBM", rank]])]]);
        e.evaluate([r], ctx([quote("A", 100)], ranksAt(2)), 0); // 초기화(둘 다/하나 미충족)
        expect(e.evaluate([r], ctx([quote("A", 106)], ranksAt(2)), 5_000)).toHaveLength(0); // 밴드만 충족
        expect(e.evaluate([r], ctx([quote("A", 106)], ranksAt(1)), 10_000)).toHaveLength(1); // 둘 다 충족
    });

    it("삭제된 룰의 무장 상태는 청소된다", () => {
        const r: AlertRule = { id: "gone", code: "A", band: { baseline: 100, lowerPct: 5, upperPct: null } };
        const e = new AlertEngine();
        e.evaluate([r], ctx([quote("A", 106)]), 0); // 초기화(안)
        e.evaluate([], ctx([quote("A", 106)]), 5_000); // 룰 삭제 → 상태 청소
        expect(e.stateOf("gone")).toBeUndefined();
        // 같은 id 로 재생성하면 초기화부터(이전 상태 잔재 없음)
        expect(e.evaluate([r], ctx([quote("A", 106)]), 10_000)).toHaveLength(0);
    });
});

describe("computeThemeRanks / RankTracker", () => {
    it("테마별 거래대금 내림차순 1-based 순위, 다중 테마 지원", () => {
        const themesOf = (c: string): string[] => (c === "A" ? ["HBM", "전력"] : c === "B" ? ["HBM"] : []);
        const ranks = computeThemeRanks([quote("A", 100, 500), quote("B", 100, 900), quote("C", 100, 999)], themesOf);
        expect(ranks.get("A")?.get("HBM")).toBe(2);
        expect(ranks.get("B")?.get("HBM")).toBe(1);
        expect(ranks.get("A")?.get("전력")).toBe(1);
        expect(ranks.get("C")).toBeUndefined(); // 테마 미배정
    });

    it("rankAgo: ~60초 전 순위 반환, 이력 미적립/스테일은 undefined", () => {
        const t = new RankTracker();
        const ranks = (r: number) => new Map([["A", new Map([["HBM", r]])]]);
        t.push(ranks(5), 0);
        expect(t.rankAgo("A", "HBM", 30_000)).toBeUndefined(); // 아직 60초 안 지남
        t.push(ranks(3), 65_000);
        expect(t.rankAgo("A", "HBM", 65_000)).toBe(5); // 65초 전 틱
        expect(t.rankAgo("A", "HBM", 200_000)).toBeUndefined(); // 창 밖 스테일(프루닝 전이어도 2×창 거부)
    });
});
