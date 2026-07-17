import { describe, it, expect } from "vitest";
import { AlertsRuntime, type AlertConfigView, type AlertTickDeps } from "../alertsRuntime.js";
import type { GateVerdict } from "../notifyGate.js";
import type { AlarmRule } from "../types.js";
import type { Quote } from "../../engine/types.js";

const quote = (code: string, price: number, ts: number, over: Partial<Quote> = {}): Quote => ({
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
    ...over,
});

/** code 스코프(집중 감시) 가격 규칙 — 옛 watchlist price leaf 의 통합판. */
const priceRule = (id: string, code: string, value: number, cooldownMs?: number): AlarmRule => ({
    id,
    code,
    predicates: [{ kind: "price", params: { op: 0, value } }],
    output: "telegram",
    cooldownMs,
});

/** 유니버스(스코프 없는) 규칙. */
const uRule = (id: string, over: Partial<AlarmRule> = {}): AlarmRule => ({
    id,
    predicates: [{ kind: "marketCap", params: { lteEok: 5_000 } }],
    output: "telegram",
    ...over,
});

const config = (alarms: AlarmRule[], opts: { watchlist?: string[]; blacklist?: string[]; blacklistAll?: string[] } = {}): AlertConfigView => ({
    watchlist: opts.watchlist ?? ["005930"],
    alarms,
    activeBlacklist: () => [
        ...(opts.blacklist ?? []).map((code) => ({ code, until: Number.MAX_SAFE_INTEGER })),
        ...(opts.blacklistAll ?? []).map((code) => ({ code, until: Number.MAX_SAFE_INTEGER, scope: "all" as const })),
    ],
});

const themesOf = (code: string): string[] => (code === "005930" ? ["반도체", "AI"] : []);
const prevClose = (): number => 100;

/** 초기화 틱(무장) 후 조건 안으로 진입시켜 1회 발화시킨다. */
function fire(rt: AlertsRuntime, code: string, price: number, at: number): void {
    rt.tick([quote(code, 100, at - 1)], themesOf, prevClose, at - 1); // 초기화(밖)
    rt.tick([quote(code, price, at)], themesOf, prevClose, at); // 진입 → 발화
}

describe("AlertsRuntime — code 스코프(집중 감시) 규칙", () => {
    it("발화는 로그에 남고 seq 가 증가한다 — scope=watchlist·전체 테마·배달 결과 포함", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);

        const { entries, latestSeq } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(latestSeq).toBe(1);
        expect(entries[0].scope).toBe("watchlist");
        expect(entries[0].themes).toEqual(["반도체", "AI"]);
        expect(entries[0].firing.code).toBe("005930");
        expect(entries[0].delivery).toBe("sent");
    });

    it("근거 = core 술어 predicateEvidence 문구(실측값·임계)", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);
        expect(rt.logSince(0).entries[0].firing.evidence).toEqual([{ kind: "pred", text: "110원 ≥ 105원" }]);
    });

    it("themeRank(지정 테마) — 순위 진입 엣지에 발화, 근거에 순위 변화", () => {
        // 두 종목이 반도체 소속. 000660 이 1위, 005930 이 2위 → threshold 1 규칙은 밖.
        // 다음 틱 005930 이 역전(1위) → 발화. past(60초 전) 는 이력 부족이라 근거에 변화 생략.
        const themes2 = (c: string): string[] => (["005930", "000660"].includes(c) ? ["반도체"] : []);
        const rule: AlarmRule = {
            id: "tr",
            code: "005930",
            predicates: [{ kind: "themeRank", params: { market: 1, mode: 0, threshold: 1 }, textParams: { theme: "반도체" } }],
            output: "telegram",
        };
        const rt = new AlertsRuntime(config([rule]), () => {});
        rt.tick([quote("005930", 110, 0), quote("000660", 120, 0)], themes2, prevClose, 0); // 2위 — 무장(밖)
        rt.tick([quote("005930", 130, 5_000), quote("000660", 120, 5_000)], themes2, prevClose, 5_000); // 1위 진입

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].firing.evidence).toEqual([{ kind: "pred", text: "반도체 UN 1위 (1위 이내)" }]);
    });

    it("3치 보존 — 데이터 결손(테마 순위 미도착) 동안은 스킵, 도착 시 이미 조건 안이면 무장만(발화 없음)", () => {
        const rule: AlarmRule = {
            id: "tr",
            code: "005930",
            predicates: [{ kind: "themeRank", params: { market: 1, mode: 0, threshold: 3 }, textParams: { theme: "반도체" } }],
            output: "telegram",
        };
        const rt = new AlertsRuntime(config([rule]), () => {});
        const noPrev = (): number | undefined => undefined; // 전일종가 미도착 → 순위 없음 = 미결
        rt.tick([quote("005930", 110, 0)], themesOf, noPrev, 0); // 미결 — 상태 없음(스킵)
        rt.tick([quote("005930", 110, 5_000)], themesOf, prevClose, 5_000); // 데이터 도착, 이미 1위 — 초기화(무장만)
        rt.tick([quote("005930", 110, 10_000)], themesOf, prevClose, 10_000); // 유지
        expect(rt.logSince(0).entries).toHaveLength(0); // 결손→도착이 가짜 엣지를 만들지 않는다
    });

    it("일시 결측(시세 없음)에도 무장 유지 — 복귀 틱에 진입해 있으면 발화", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        rt.tick([quote("005930", 100, 0)], themesOf, prevClose, 0); // 무장(밖)
        rt.tick([], themesOf, prevClose, 5_000); // 결측 — 스코프 규칙은 상태 유지
        rt.tick([quote("005930", 110, 10_000)], themesOf, prevClose, 10_000); // 복귀 + 진입
        expect(rt.logSince(0).entries).toHaveLength(1); // 무장이 풀리지 않았으므로 발화
    });

    it("쿨다운에 억제된 발화도 로그엔 남는다(delivery=suppressed)", () => {
        const sinks: GateVerdict[] = [];
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105, 60_000)]), (v) => sinks.push(v));
        fire(rt, "005930", 110, 1_000);
        fire(rt, "005930", 110, 10_000); // 쿨다운(60s) 안 재진입

        const { entries } = rt.logSince(0);
        expect(entries.map((e) => e.delivery)).toEqual(["sent", "suppressed"]);
        expect(sinks[1].passed).toHaveLength(0);
        expect(sinks[1].suppressed).toHaveLength(1);
    });

    it("스코프 규칙은 룰별 억제 — 같은 종목 다른 규칙은 서로 막지 않는다", () => {
        const rules = [priceRule("돌파", "005930", 105, 60_000), priceRule("고가", "005930", 108, 60_000)];
        const rt = new AlertsRuntime(config(rules), () => {});
        rt.tick([quote("005930", 100, 0)], themesOf, prevClose, 0);
        rt.tick([quote("005930", 110, 1_000)], themesOf, prevClose, 1_000); // 둘 다 진입
        expect(rt.logSince(0).entries.every((e) => e.delivery === "sent")).toBe(true);
    });

    it("logSince — 커서 초과분만(증분 폴링). 서버 재시작은 latestSeq<since 로 클라가 감지", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);
        fire(rt, "005930", 110, 10_000);
        expect(rt.logSince(0).entries).toHaveLength(2);
        expect(rt.logSince(1).entries.map((e) => e.seq)).toEqual([2]);
        expect(rt.logSince(2).entries).toHaveLength(0);

        const fresh = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        expect(fresh.logSince(99).latestSeq).toBe(0);
    });

    it("view — code 스코프 규칙만 + 무장 상태·마지막 발화(유니버스 규칙은 /universe 소관)", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105), uRule("u1")]), () => {});
        fire(rt, "005930", 110, 1_000);
        const v = rt.view();
        expect(v.rules.map((r) => r.id)).toEqual(["r1"]); // 유니버스 규칙 제외
        expect(v.rules[0].lastFiredAt).toBe(1_000);
        expect(v.rules[0].inZone).toBe(true);
        expect(v.codes).toEqual(["005930"]);
    });
});

/** 링버퍼 스텁 — 델타 창 기준점 제공. */
const depsFor = (history: Record<string, Quote[]>): AlertTickDeps => ({
    historyOf: (c) => history[c] ?? [],
    trailingHighsOf: () => undefined,
});

describe("AlertsRuntime — 유니버스(탐지) 규칙", () => {
    it("종목을 안 골라도 유니버스 전체에서 매칭 엣지에 발화 — scope=universe", () => {
        const rt = new AlertsRuntime(config([uRule("u1", { name: "소형주" })], { watchlist: [] }), () => {});
        rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
        rt.tick([quote("111111", 100, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000);

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].scope).toBe("universe");
        expect(entries[0].delivery).toBe("sent");
        expect(entries[0].firing.note).toBe("소형주");
        expect(entries[0].firing.evidence).toEqual([{ kind: "pred", text: "시총 3,000억 (≤ 5,000억)" }]);
    });

    it("이미 조건 안인 종목의 첫 관찰은 초기화(발화 없음) — 신규 편입·재기동 폭풍 방지", () => {
        const rt = new AlertsRuntime(config([uRule("u1")], { watchlist: [] }), () => {});
        rt.tick([quote("111111", 100, 0, { marketCap: 3_000 })], themesOf, prevClose, 0);
        rt.tick([quote("111111", 100, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000);
        expect(rt.logSince(0).entries).toHaveLength(0);
    });

    it("signal 술어 — 30초 델타(링버퍼)가 임계를 넘는 순간 발화, 근거에 실측 델타", () => {
        const rule = uRule("sig", { predicates: [{ kind: "signal", params: { window: 0, rateMin: 0.4, tvMin: 40 } }] });
        const rt = new AlertsRuntime(config([rule], { watchlist: [] }), () => {});
        const code = "222222";
        const q0 = quote(code, 100, 0, { changeRate: 1.0, tradeValue: 10_000 });
        const q1 = quote(code, 105, 35_000, { changeRate: 1.5, tradeValue: 14_500 });
        rt.tick([q0], themesOf, prevClose, 0, depsFor({ [code]: [q0] }));
        rt.tick([q1], themesOf, prevClose, 35_000, depsFor({ [code]: [q0, q1] }));

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].firing.evidence[0]).toEqual({ kind: "pred", text: "30초 시그널 (+0.5%p · 45억)" });
    });

    it("output=log 규칙은 텔레그램에 안 가고(logOnly) 쿨다운도 소모하지 않는다", () => {
        const sinks: GateVerdict[] = [];
        const rt = new AlertsRuntime(config([uRule("u1", { output: "log" })], { watchlist: [] }), (v) => sinks.push(v));
        rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
        rt.tick([quote("111111", 100, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000);

        expect(rt.logSince(0).entries[0].delivery).toBe("logOnly");
        expect(sinks.every((v) => v.passed.length === 0 && v.suppressed.length === 0)).toBe(true);
    });

    it("블랙리스트 scope=all — 유니버스 발화가 로그조차 안 남는다, 집중 감시는 무관", () => {
        const rt = new AlertsRuntime(
            config([priceRule("w1", "005930", 105), uRule("u1")], { blacklistAll: ["005930"] }),
            () => {},
        );
        rt.tick([quote("005930", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
        rt.tick([quote("005930", 110, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000);

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].scope).toBe("watchlist");
        expect(entries[0].delivery).toBe("sent");
    });

    it("블랙리스트 scope=telegram — 유니버스 발화는 blacklisted 로 로그에 남음, 집중 감시는 sent", () => {
        const rt = new AlertsRuntime(
            config([priceRule("w1", "005930", 105), uRule("u1")], { blacklist: ["005930"] }),
            () => {},
        );
        rt.tick([quote("005930", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
        rt.tick([quote("005930", 110, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000);

        const byScope = new Map(rt.logSince(0).entries.map((e) => [e.scope, e.delivery]));
        expect(byScope.get("universe")).toBe("blacklisted");
        expect(byScope.get("watchlist")).toBe("sent");
    });

    it("쿨다운 키 code(기본) — 다른 규칙이라도 같은 종목이면 억제 / codeRule — 규칙별 독립", () => {
        const mk = (key?: "code" | "codeRule"): AlarmRule[] => [
            uRule("a", { cooldownKey: key, cooldownMs: 60_000 }),
            uRule("b", { cooldownKey: key, cooldownMs: 60_000, predicates: [{ kind: "marketCap", params: { lteEok: 4_000 } }] }),
        ];
        const later = (key?: "code" | "codeRule"): string => {
            const rt = new AlertsRuntime(config(mk(key), { watchlist: [] }), () => {});
            rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
            rt.tick([quote("111111", 100, 5_000, { marketCap: 4_500 })], themesOf, prevClose, 5_000); // a 만 진입
            rt.tick([quote("111111", 100, 10_000, { marketCap: 3_000 })], themesOf, prevClose, 10_000); // b 진입
            const entries = rt.logSince(0).entries;
            return entries[entries.length - 1].delivery;
        };
        expect(later("code")).toBe("suppressed");
        expect(later("codeRule")).toBe("sent");
    });

    it("유니버스 이탈 → 재편입은 초기화(조용) — hot 멤버십 churn 이 가짜 엣지를 안 만든다", () => {
        const rt = new AlertsRuntime(config([uRule("u1")], { watchlist: [] }), () => {});
        rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
        rt.tick([], themesOf, prevClose, 5_000); // 이탈 — 상태 소멸
        rt.tick([quote("111111", 100, 10_000, { marketCap: 3_000 })], themesOf, prevClose, 10_000); // 재편입, 조건 안 — 초기화
        expect(rt.logSince(0).entries).toHaveLength(0);
    });

    it("발화에 테마 컨텍스트 — 소속 테마 칩 + 유니버스 멤버 3+ 인 테마만 보드", () => {
        const themes3 = (c: string): string[] => (["005930", "000660", "373220"].includes(c) ? (c === "005930" ? ["반도체", "AI"] : ["반도체"]) : []);
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        const universe = (p: number, at: number): Quote[] => [quote("005930", p, at), quote("000660", 130, at), quote("373220", 120, at)];
        rt.tick(universe(100, 0), themes3, prevClose, 0);
        rt.tick(universe(110, 1_000), themes3, prevClose, 1_000);

        const ctx = rt.logSince(0).entries[0].firing.themeContext;
        expect(ctx?.chips).toEqual(["반도체", "AI"]);
        expect(ctx?.boards).toHaveLength(1);
        expect(ctx?.boards[0].members.map((m) => m.code)).toEqual(["000660", "373220", "005930"]);
        expect(ctx?.boards[0].members.find((m) => m.code === "005930")?.isSelf).toBe(true);
    });
});
