import { describe, it, expect } from "vitest";
import { AlertsRuntime, type AlertConfigView } from "../alertsRuntime.js";
import type { GateVerdict } from "../notifyGate.js";
import type { AlertRule } from "../types.js";
import type { Quote } from "../../engine/types.js";

const quote = (code: string, price: number, ts: number): Quote => ({
    code,
    name: `${code}명`,
    price,
    changeRate: 1.2,
    volume: 0,
    base: 100,
    open: 100,
    high: price,
    low: 100,
    marketCap: 1_000,
    tradeValue: 0,
    ts,
});

const priceRule = (id: string, code: string, value: number, cooldownMs?: number): AlertRule => ({
    id,
    code,
    leaves: [{ kind: "price", op: "gte", value }],
    cooldownMs,
});

const config = (rules: AlertRule[], watchlist = ["005930"]): AlertConfigView => ({ watchlist, rules });
const themesOf = (code: string): string[] => (code === "005930" ? ["반도체", "AI"] : []);
const prevClose = (): number => 100;

/** 초기화 틱(무장) 후 조건 안으로 진입시켜 1회 발화시킨다. */
function fire(rt: AlertsRuntime, code: string, price: number, at: number): void {
    rt.tick([quote(code, 100, at - 1)], themesOf, prevClose, at - 1); // 초기화(밖)
    rt.tick([quote(code, price, at)], themesOf, prevClose, at); // 진입 → 발화
}

describe("AlertsRuntime 발화 로그", () => {
    it("발화는 로그에 남고 seq 가 증가한다 — 종목코드·전체 테마·갈래를 함께(클라 필터용)", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);

        const { entries, latestSeq } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(latestSeq).toBe(1);
        expect(entries[0].seq).toBe(1);
        expect(entries[0].scope).toBe("watchlist");
        expect(entries[0].themes).toEqual(["반도체", "AI"]); // 그 종목의 전체 테마
        expect(entries[0].firing.code).toBe("005930");
        expect(entries[0].notified).toBe(true);
    });

    it("발화에 leaf 근거가 실린다 — 왜 울렸는지", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);
        expect(rt.logSince(0).entries[0].firing.evidence).toEqual([{ kind: "price", text: "110원 ≥ 105원" }]);
    });

    it("쿨다운에 억제된 발화도 로그엔 남는다(notified=false) — PC 앞에서 전체를 보기 위함", () => {
        const sinks: GateVerdict[] = [];
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105, 60_000)]), (v) => sinks.push(v));
        fire(rt, "005930", 110, 1_000); // 1차 발화 → 배달
        fire(rt, "005930", 110, 10_000); // 쿨다운(60s) 안 재진입 → 발화하되 억제

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(2);
        expect(entries.map((e) => e.notified)).toEqual([true, false]);
        expect(sinks[1].passed).toHaveLength(0);
        expect(sinks[1].suppressed).toHaveLength(1);
    });

    it("logSince — 커서 초과분만(증분 폴링). 서버 재시작은 latestSeq<since 로 클라가 감지", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);
        fire(rt, "005930", 110, 10_000);
        expect(rt.logSince(0).entries).toHaveLength(2); // 첫 로드 = 전체
        expect(rt.logSince(1).entries.map((e) => e.seq)).toEqual([2]); // 증분
        expect(rt.logSince(2).entries).toHaveLength(0); // 새 것 없음
        expect(rt.logSince(2).latestSeq).toBe(2);

        const fresh = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        expect(fresh.logSince(99).latestSeq).toBe(0); // 재시작 직후 — 클라 커서(99) > latestSeq → 리셋 신호
    });

    it("watchlist 룰은 룰별 억제 — 같은 종목 다른 조건은 서로 막지 않는다", () => {
        const rules = [priceRule("돌파", "005930", 105, 60_000), priceRule("고가", "005930", 108, 60_000)];
        const rt = new AlertsRuntime(config(rules), () => {});
        rt.tick([quote("005930", 100, 0)], themesOf, prevClose, 0); // 초기화(둘 다 밖)
        rt.tick([quote("005930", 110, 1_000)], themesOf, prevClose, 1_000); // 둘 다 진입

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(2);
        expect(entries.every((e) => e.notified)).toBe(true); // 쿨다운 안이지만 다른 룰이라 서로 무관
    });

    it("view 에는 발화 목록이 없다 — 로그가 단일 자리(룰별 lastFiredAt 은 남는다)", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);
        const v = rt.view();
        expect(v).not.toHaveProperty("firings");
        expect(v.rules[0].lastFiredAt).toBe(1_000);
        expect(v.codes).toEqual(["005930"]);
    });
});
