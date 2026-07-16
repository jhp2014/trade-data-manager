import { describe, it, expect } from "vitest";
import { activeDelta, computeDeltas } from "../signals.js";
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

// 유니버스 알람·보드 필터의 원재료 — 30초·1분 창별 rate(%p)·tvEok(억).
describe("computeDeltas", () => {
    it("두 창의 원재료 델타 — 기준점 있는 창만 실린다", () => {
        const h = [q(0, 1.0, 10_000), q(35_000, 1.4, 13_000), q(65_000, 1.7, 14_500)];
        const d = computeDeltas(h, 65_000);
        // 30초 창: 기준 = ts 35_000(65s-30s=35s 이하 최신... ts<=35_000) → rate 0.3, tv 15억
        expect(d.d30s).toEqual({ rate: expect.closeTo(0.3, 5), tvEok: 15 });
        // 1분 창: 기준 = ts 0 → rate 0.7, tv 45억
        expect(d.d1m).toEqual({ rate: expect.closeTo(0.7, 5), tvEok: 45 });
    });

    it("이력 부족(창 기준점 없음)이면 그 창은 생략 — 신규 편입 직후", () => {
        const h = [q(0, 1.0, 10_000), q(35_000, 1.4, 13_000)];
        const d = computeDeltas(h, 35_000); // 35초치 — 30초 창만 가능
        expect(d.d30s).toBeDefined();
        expect(d.d1m).toBeUndefined();
        expect(computeDeltas([q(0, 1, 1_000)], 0)).toEqual({}); // 단일 틱
    });

    it("갭 너머 stale(>2×창) 기준점은 거부", () => {
        const h = [q(0, 1.0, 10_000), q(70_000, 2.0, 20_000)];
        expect(computeDeltas(h, 70_000).d30s).toBeUndefined(); // 30초 창 기준점이 70초 전 — 60초 초과 stale
    });
});
