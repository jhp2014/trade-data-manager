import { describe, it, expect } from "vitest";
import { NotifyGate, type GatePolicy } from "../notifyGate.js";
import type { AlertFiring } from "../types.js";

const firing = (code: string, ruleId: string): AlertFiring => ({
    ruleId,
    code,
    name: `${code}명`,
    at: 0,
    features: { price: 10_000, changeRate: 1.2 },
    evidence: [],
});

/** watchlist 정책 — 룰별 억제(조건마다 다른 사건). */
const byRule = (cooldownMs = 60_000) => (f: AlertFiring): GatePolicy => ({ key: f.ruleId, cooldownMs });
/** 유니버스 정책 — 종목별 억제(같은 사건의 중복). */
const byCode = (cooldownMs = 60_000) => (f: AlertFiring): GatePolicy => ({ key: f.code, cooldownMs });

describe("NotifyGate", () => {
    it("첫 발화는 통과, 쿨다운 안 재발화는 억제 — 다만 억제분도 돌려준다(로그에 남겨야 하므로)", () => {
        const g = new NotifyGate();
        expect(g.pass([firing("005930", "a")], byRule(), 0).passed).toHaveLength(1);

        const second = g.pass([firing("005930", "a")], byRule(), 30_000);
        expect(second.passed).toHaveLength(0);
        expect(second.suppressed).toHaveLength(1);

        expect(g.pass([firing("005930", "a")], byRule(), 61_000).passed).toHaveLength(1);
    });

    it("watchlist(룰별 키) — 같은 종목이라도 다른 조건이면 서로 막지 않는다(돌파와 이탈은 다른 사건)", () => {
        const g = new NotifyGate();
        g.pass([firing("005930", "돌파")], byRule(), 0);
        expect(g.pass([firing("005930", "이탈")], byRule(), 10_000).passed).toHaveLength(1);
    });

    it("유니버스(종목별 키) — 다른 조건에 걸려도 같은 종목이면 억제(조건 OR 의 중복 알람 방지)", () => {
        const g = new NotifyGate();
        g.pass([firing("005930", "30초")], byCode(), 0);
        const next = g.pass([firing("005930", "1분")], byCode(), 10_000);
        expect(next.passed).toHaveLength(0);
        expect(next.suppressed).toHaveLength(1);
    });

    it("키가 다르면 서로 막지 않는다(종목별 키 기준 다른 종목)", () => {
        const g = new NotifyGate();
        g.pass([firing("005930", "a")], byCode(), 0);
        expect(g.pass([firing("000660", "a")], byCode(), 10_000).passed).toHaveLength(1);
    });

    it("기간은 **배달 시점**의 것 — 짧은 쿨다운 발화가 긴 침묵을 조기에 풀지 못한다", () => {
        const g = new NotifyGate();
        const policy = (f: AlertFiring): GatePolicy => ({ key: f.code, cooldownMs: f.ruleId === "long" ? 100_000 : 10_000 });
        g.pass([firing("005930", "short"), firing("005930", "long")], policy, 0); // 배달 기간 = max(10s,100s)
        expect(g.pass([firing("005930", "short")], policy, 50_000).passed).toHaveLength(0);
        expect(g.pass([firing("005930", "short")], policy, 101_000).passed).toHaveLength(1);
    });

    it("같은 키 같은 틱 다중 발화는 통째로 통과(메시지 묶기는 buildFiringMessages 몫)", () => {
        const g = new NotifyGate();
        const v = g.pass([firing("005930", "a"), firing("005930", "b")], byCode(), 0);
        expect(v.passed).toHaveLength(2);
        expect(g.lastNotifiedAt("005930")).toBe(0);
    });

    it("배달된 적 없는 키는 lastNotifiedAt null", () => {
        expect(new NotifyGate().lastNotifiedAt("005930")).toBeNull();
    });
});
