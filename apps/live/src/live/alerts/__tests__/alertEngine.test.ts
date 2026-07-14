import { describe, it, expect } from "vitest";
import type { Quote } from "../../engine/types.js";
import { AlertEngine, type AlertEvalContext } from "../alertEngine.js";
import { computeThemeRanks, RankTracker, rankKey } from "../themeRank.js";
import type { AlertLeaf, AlertMarket, AlertRule } from "../types.js";

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

interface CtxOpts {
    prevCloseOf?: (c: string, m: AlertMarket) => number | undefined;
    rankOf?: (c: string, t: string, m: AlertMarket) => number | undefined;
    rankAgoOf?: (c: string, t: string, m: AlertMarket) => number | undefined;
}
/** 평가 컨텍스트 — 시세 + (옵션) 전일종가·순위·과거순위. */
function ctx(quotes: Quote[], opts: CtxOpts = {}): AlertEvalContext {
    const byCode = new Map(quotes.map((q) => [q.code, q]));
    return {
        quoteOf: (c) => byCode.get(c),
        prevCloseOf: opts.prevCloseOf ?? (() => undefined),
        rankOf: opts.rankOf ?? (() => undefined),
        rankAgoOf: opts.rankAgoOf ?? (() => undefined),
    };
}

/** 밴드 = price≥lo AND price≤hi (leaves). null=그 방향 무제한(leaf 생략). */
function bandRule(lo: number | null, hi: number | null, extra: Partial<AlertRule> = {}): AlertRule {
    const leaves: AlertLeaf[] = [];
    if (lo != null) leaves.push({ kind: "price", op: "gte", value: lo });
    if (hi != null) leaves.push({ kind: "price", op: "lte", value: hi });
    return { id: "r1", code: "005930", leaves, ...extra };
}

describe("AlertEngine — 가격(절대 임계) 밴드", () => {
    const rule = bandRule(105, 110); // [105,110]

    it("진입 엣지에만 발화 — 초기화 틱은 무장만, 밴드 안 유지는 재발화 없음", () => {
        const e = new AlertEngine();
        expect(e.evaluate([rule], ctx([quote("005930", 100)]), 0)).toHaveLength(0); // 초기화(밖)
        const fired = e.evaluate([rule], ctx([quote("005930", 106)]), 5_000); // 진입
        expect(fired).toHaveLength(1);
        expect(fired[0].features.price).toBe(106);
        expect(e.evaluate([rule], ctx([quote("005930", 108)]), 10_000)).toHaveLength(0); // 안에서 유지
    });

    it("이미 밴드 안에서 조건 생성(초기화) → 즉시 발화 없음, 나갔다 재진입해야 발화", () => {
        const e = new AlertEngine();
        expect(e.evaluate([rule], ctx([quote("005930", 107)]), 0)).toHaveLength(0); // 초기화(안)
        expect(e.evaluate([rule], ctx([quote("005930", 103)]), 5_000)).toHaveLength(0); // 하강(재무장)
        expect(e.evaluate([rule], ctx([quote("005930", 106)]), 10_000)).toHaveLength(1); // 재진입 → 발화
    });

    it("쿨다운 내 재진입은 억제(그 진입은 버림), 쿨다운 후 재진입은 발화", () => {
        const e = new AlertEngine();
        const r = bandRule(105, 110, { cooldownMs: 60_000 });
        e.evaluate([r], ctx([quote("005930", 100)]), 0); // 초기화
        expect(e.evaluate([r], ctx([quote("005930", 106)]), 5_000)).toHaveLength(1); // 발화
        e.evaluate([r], ctx([quote("005930", 100)]), 10_000); // 이탈(재무장)
        expect(e.evaluate([r], ctx([quote("005930", 106)]), 20_000)).toHaveLength(0); // 쿨다운 내 재진입 — 억제
        e.evaluate([r], ctx([quote("005930", 100)]), 30_000); // 이탈
        expect(e.evaluate([r], ctx([quote("005930", 106)]), 70_000)).toHaveLength(1); // 쿨다운 경과 후 재진입
    });

    it("상단 무제한([≥105]) — 갭 관통도 잡고 / 유계([105,110]) — 밴드 너머 런어웨이는 패스", () => {
        const open: AlertRule = { id: "o", code: "005930", leaves: [{ kind: "price", op: "gte", value: 105 }] };
        const closed: AlertRule = { id: "c", code: "005930", leaves: [{ kind: "price", op: "gte", value: 105 }, { kind: "price", op: "lte", value: 110 }] };
        const e = new AlertEngine();
        e.evaluate([open, closed], ctx([quote("005930", 100)]), 0); // 초기화(둘 다 밖)
        const fired = e.evaluate([open, closed], ctx([quote("005930", 120)]), 5_000); // 120 관통
        expect(fired.map((f) => f.ruleId)).toEqual(["o"]); // 무제한만 발화, 유계는 관통 패스
    });

    it("하단 무제한([≤95]) — 급락 진입 잡기", () => {
        const r: AlertRule = { id: "dn", code: "005930", leaves: [{ kind: "price", op: "lte", value: 95 }] };
        const e = new AlertEngine();
        e.evaluate([r], ctx([quote("005930", 100)]), 0);
        expect(e.evaluate([r], ctx([quote("005930", 90)]), 5_000)).toHaveLength(1);
    });

    it("시세 결손 틱은 상태 불변 — 결손이 가짜 재무장(재발화)을 만들지 않는다", () => {
        const e = new AlertEngine();
        e.evaluate([rule], ctx([quote("005930", 100)]), 0); // 초기화(밖)
        expect(e.evaluate([rule], ctx([quote("005930", 106)]), 5_000)).toHaveLength(1); // 진입 발화
        expect(e.evaluate([rule], ctx([]), 10_000)).toHaveLength(0); // 시세 결손 — 스킵
        expect(e.evaluate([rule], ctx([quote("005930", 107)]), 300_000)).toHaveLength(0); // 여전히 안 — 엣지 아님
    });
});

describe("AlertEngine — 순위 leaf · AND", () => {
    it("rank reach: 순위가 K 이하로 내려온 엣지에 발화", () => {
        const r: AlertRule = { id: "rk", code: "A", leaves: [{ kind: "rank", theme: "HBM", market: "un", mode: "reach", threshold: 1 }] };
        const e = new AlertEngine();
        e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 2 }), 0); // 초기화(2등)
        expect(e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 1 }), 5_000)).toHaveLength(1); // 1등 도달
        expect(e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 1 }), 10_000)).toHaveLength(0); // 유지
    });

    it("rank delta: 60s 창 순위 상승 계단 ≥ D 에 발화, 이력 미적립이면 스킵", () => {
        const r: AlertRule = { id: "rd", code: "A", leaves: [{ kind: "rank", theme: "HBM", market: "un", mode: "delta", threshold: 3 }], cooldownMs: 1 };
        const e = new AlertEngine();
        expect(e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 2, rankAgoOf: () => undefined }), 0)).toHaveLength(0); // 이력 없음 → 스킵
        expect(e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 2, rankAgoOf: () => 6 }), 5_000)).toHaveLength(0); // Δ=4 지만 초기화 틱
        e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 2, rankAgoOf: () => 3 }), 10_000); // Δ=1 < 3 → false(재무장)
        expect(e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 2, rankAgoOf: () => 7 }), 15_000)).toHaveLength(1); // Δ=5 → 발화
    });

    it("leaves AND(price+rank) — 둘 다 참이어야 발화", () => {
        const r: AlertRule = { id: "and", code: "A", leaves: [{ kind: "price", op: "gte", value: 106 }, { kind: "rank", theme: "HBM", market: "un", mode: "reach", threshold: 1 }] };
        const e = new AlertEngine();
        e.evaluate([r], ctx([quote("A", 100)], { rankOf: () => 2 }), 0); // 초기화(둘 다 미충족)
        expect(e.evaluate([r], ctx([quote("A", 106)], { rankOf: () => 2 }), 5_000)).toHaveLength(0); // 가격만
        expect(e.evaluate([r], ctx([quote("A", 106)], { rankOf: () => 1 }), 10_000)).toHaveLength(1); // 둘 다
    });

    it("미결 leaf(순위 데이터 없음) 있으면 가격이 참이어도 식 미결 → 스킵", () => {
        const r: AlertRule = { id: "sk", code: "A", leaves: [{ kind: "price", op: "gte", value: 100 }, { kind: "rank", theme: "HBM", market: "un", mode: "reach", threshold: 1 }] };
        const e = new AlertEngine();
        expect(e.evaluate([r], ctx([quote("A", 105)]), 0)).toHaveLength(0); // 순위 미도착 → 스킵(가격 105≥100 이지만)
        expect(e.stateOf("sk")).toBeUndefined();
        e.evaluate([r], ctx([quote("A", 95)], { rankOf: () => 2 }), 5_000); // 가격 미충족 → 초기화(false)
        expect(e.evaluate([r], ctx([quote("A", 105)], { rankOf: () => 1 }), 10_000)).toHaveLength(1); // 둘 다 → 발화
    });

    it("삭제된 조건의 무장 상태는 청소된다", () => {
        const r: AlertRule = { id: "gone", code: "A", leaves: [{ kind: "price", op: "gte", value: 105 }] };
        const e = new AlertEngine();
        e.evaluate([r], ctx([quote("A", 106)]), 0); // 초기화(안)
        e.evaluate([], ctx([quote("A", 106)]), 5_000); // 조건 삭제 → 상태 청소
        expect(e.stateOf("gone")).toBeUndefined();
        expect(e.evaluate([r], ctx([quote("A", 106)]), 10_000)).toHaveLength(0); // 재생성 → 초기화부터
    });
});

describe("computeThemeRanks / RankTracker", () => {
    it("테마별 등락률 내림차순 1-based 순위, 미배정 제외", () => {
        const themesOf = (c: string): string[] => (c === "A" ? ["HBM", "전력"] : c === "B" ? ["HBM"] : []);
        const prevClose = (): number => 100; // 모든 종목·시장 전일종가 100
        const ranks = computeThemeRanks([quote("A", 110), quote("B", 120), quote("C", 130)], themesOf, prevClose);
        expect(ranks.get(rankKey("A", "HBM", "un"))).toBe(2); // A +10% < B +20%
        expect(ranks.get(rankKey("B", "HBM", "un"))).toBe(1);
        expect(ranks.get(rankKey("A", "전력", "un"))).toBe(1);
        expect(ranks.get(rankKey("C", "HBM", "un"))).toBeUndefined(); // 테마 미배정
    });

    it("전일종가 없는 시장은 그 순위에서 제외", () => {
        const themesOf = (): string[] => ["HBM"];
        const prevClose = (_c: string, m: AlertMarket): number | undefined => (m === "un" ? 100 : undefined); // krx 전일종가 없음
        const ranks = computeThemeRanks([quote("A", 110), quote("B", 120)], themesOf, prevClose);
        expect(ranks.get(rankKey("A", "HBM", "un"))).toBe(2);
        expect(ranks.get(rankKey("A", "HBM", "krx"))).toBeUndefined();
    });

    it("동률 등락률은 거래대금 내림차순으로 순위", () => {
        const themesOf = (): string[] => ["HBM"];
        const prevClose = (): number => 100;
        const ranks = computeThemeRanks([quote("B", 110, 500), quote("A", 110, 900)], themesOf, prevClose); // 둘 다 +10%
        expect(ranks.get(rankKey("A", "HBM", "un"))).toBe(1); // 거래대금 큰 A 우선
        expect(ranks.get(rankKey("B", "HBM", "un"))).toBe(2);
    });

    it("rankAgo: ~60초 전 순위 반환, 이력 미적립/스테일은 undefined", () => {
        const t = new RankTracker();
        const key = rankKey("A", "HBM", "un");
        t.push(new Map([[key, 5]]), 0);
        expect(t.rankAgo(key, 30_000)).toBeUndefined(); // 아직 60초 안 지남
        t.push(new Map([[key, 3]]), 65_000);
        expect(t.rankAgo(key, 65_000)).toBe(5); // 65초 전 틱
        expect(t.rankAgo(key, 200_000)).toBeUndefined(); // 창 밖 스테일
    });
});
