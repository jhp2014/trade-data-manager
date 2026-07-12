import { describe, it, expect } from "vitest";
import { activeDelta } from "../signals.js";
import type { Quote } from "../types.js";

// activeDelta 만 ts·changeRate·tradeValue 를 읽는다. 나머지 필드는 값 무관 → 기본값 채움.
function q(ts: number, changeRate: number, tradeValueMillions: number): Quote {
    return {
        code: "005930",
        name: "삼성전자",
        price: 0,
        changeRate,
        volume: 0,
        base: 0,
        open: 0,
        high: 0,
        low: 0,
        marketCap: 0,
        tradeValue: tradeValueMillions, // 단위=백만원 (ka10095)
        ts,
    };
}

// 임계: rate ≥ 0.6%p, tv ≥ 60억원(=6000백만원). WINDOW=60초.
describe("activeDelta", () => {
    it("두 임계 모두 초과하면 1분 신호 발화(tvDelta 원단위)", () => {
        const hit = activeDelta([q(0, 1, 1_000), q(60_000, 2.1, 7_000)], 60_000);
        expect(hit).not.toBeNull();
        expect(hit!.label).toBe("1분");
        expect(hit!.rateDelta).toBeCloseTo(1.1);
        expect(hit!.tvDelta).toBe(6_000_000_000); // (7000-1000)백만원 → 원
    });

    it("거래대금 임계는 정확히 60억(6000백만원 증가)에서 발화", () => {
        // rate 는 넉넉히 넘기고 tv 만 경계로: 6000백만원 증가 = 60억원 = 임계 이상.
        expect(activeDelta([q(0, 1, 1_000), q(60_000, 3, 7_000)], 60_000)).not.toBeNull();
        // 5999백만원 증가 = 59.99억원 < 60억 → 미발화(단위 변환 없으면 여기서 오판).
        expect(activeDelta([q(0, 1, 1_000), q(60_000, 3, 6_999)], 60_000)).toBeNull();
    });

    it("등락률 증가가 0.6%p 미만이면 미발화", () => {
        expect(activeDelta([q(0, 1, 1_000), q(60_000, 1.5, 9_000)], 60_000)).toBeNull();
    });

    it("60초치 이력이 안 쌓이면(기준 틱 없음) null", () => {
        expect(activeDelta([q(30_000, 1, 1_000), q(60_000, 3, 9_000)], 60_000)).toBeNull();
        expect(activeDelta([q(60_000, 3, 9_000)], 60_000)).toBeNull(); // 1틱
    });

    it("기준 틱이 갭 너머 stale(>2×창)이면 비교 거부", () => {
        // ts:0 이 유일한 과거 틱인데 now 로부터 200초 전 → 120초(2×60) 초과 → null.
        expect(activeDelta([q(0, 1, 1_000), q(200_000, 5, 20_000)], 200_000)).toBeNull();
    });
});
