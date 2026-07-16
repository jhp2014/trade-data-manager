import { describe, it, expect } from "vitest";
import { AlertsRuntime, type AlertConfigView, type AlertTickDeps } from "../alertsRuntime.js";
import type { GateVerdict } from "../notifyGate.js";
import type { AlertRule, UniverseRule } from "../types.js";
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

const priceRule = (id: string, code: string, value: number, cooldownMs?: number): AlertRule => ({
    id,
    code,
    leaves: [{ kind: "price", op: "gte", value }],
    cooldownMs,
});

const config = (rules: AlertRule[], opts: { watchlist?: string[]; universeRules?: UniverseRule[]; blacklist?: string[] } = {}): AlertConfigView => ({
    watchlist: opts.watchlist ?? ["005930"],
    rules,
    universeRules: opts.universeRules ?? [],
    activeBlacklist: () => (opts.blacklist ?? []).map((code) => ({ code, until: Number.MAX_SAFE_INTEGER })),
});

const themesOf = (code: string): string[] => (code === "005930" ? ["반도체", "AI"] : []);
const prevClose = (): number => 100;

/** 초기화 틱(무장) 후 조건 안으로 진입시켜 1회 발화시킨다. */
function fire(rt: AlertsRuntime, code: string, price: number, at: number): void {
    rt.tick([quote(code, 100, at - 1)], themesOf, prevClose, at - 1); // 초기화(밖)
    rt.tick([quote(code, price, at)], themesOf, prevClose, at); // 진입 → 발화
}

describe("AlertsRuntime 발화 로그(watchlist)", () => {
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
        expect(entries[0].delivery).toBe("sent");
    });

    it("발화에 구조화 leaf 근거가 실린다 — 왜 울렸는지(실측값·임계)", () => {
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        fire(rt, "005930", 110, 1_000);
        expect(rt.logSince(0).entries[0].firing.evidence).toEqual([{ kind: "price", op: "gte", price: 110, value: 105 }]);
    });

    it("발화에 테마 컨텍스트 — 소속 테마 칩 + 유니버스 멤버 3+ 인 테마만 보드(UN 순위순, 자신 표시)", () => {
        // 반도체에 3종목(005930·000660·373220), AI 엔 005930 하나 → 반도체만 보드로 펼침.
        const themes = (c: string): string[] => (["005930", "000660", "373220"].includes(c) ? (c === "005930" ? ["반도체", "AI"] : ["반도체"]) : []);
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105)]), () => {});
        const universe = (p: number, at: number): Quote[] => [quote("005930", p, at), quote("000660", 130, at), quote("373220", 120, at)];
        rt.tick(universe(100, 0), themes, prevClose, 0); // 초기화(005930 밖)
        rt.tick(universe(110, 1_000), themes, prevClose, 1_000); // 005930 진입 → 발화

        const ctx = rt.logSince(0).entries[0].firing.themeContext;
        expect(ctx?.chips).toEqual(["반도체", "AI"]); // 소속 테마 전부
        expect(ctx?.boards).toHaveLength(1); // AI 는 멤버 1 → 칩만
        const board = ctx?.boards[0];
        expect(board?.theme).toBe("반도체");
        expect(board?.members.map((m) => m.code)).toEqual(["000660", "373220", "005930"]); // UN 순위순(등락률 130>120>110)
        expect(board?.members.find((m) => m.code === "005930")?.isSelf).toBe(true);
    });

    it("쿨다운에 억제된 발화도 로그엔 남는다(delivery=suppressed) — PC 앞에서 전체를 보기 위함", () => {
        const sinks: GateVerdict[] = [];
        const rt = new AlertsRuntime(config([priceRule("r1", "005930", 105, 60_000)]), (v) => sinks.push(v));
        fire(rt, "005930", 110, 1_000); // 1차 발화 → 배달
        fire(rt, "005930", 110, 10_000); // 쿨다운(60s) 안 재진입 → 발화하되 억제

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(2);
        expect(entries.map((e) => e.delivery)).toEqual(["sent", "suppressed"]);
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
        expect(entries.every((e) => e.delivery === "sent")).toBe(true); // 쿨다운 안이지만 다른 룰이라 서로 무관
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

// ── 유니버스 조건검색 알람 — 술어는 core 레지스트리(signal 은 링버퍼 델타 필요 → deps 주입) ──

const uRule = (id: string, over: Partial<UniverseRule> = {}): UniverseRule => ({
    id,
    predicates: [{ kind: "marketCap", params: { lteEok: 5_000 } }],
    output: "telegram",
    ...over,
});

/** 링버퍼 스텁 — 60초 전(1분 델타)·30초 전(30초 델타) 기준점을 제공. */
const depsFor = (history: Record<string, Quote[]>): AlertTickDeps => ({
    historyOf: (c) => history[c] ?? [],
    trailingHighsOf: () => undefined,
});

describe("AlertsRuntime 유니버스 알람", () => {
    it("종목을 안 골라도 유니버스 전체에서 매칭 엣지에 발화 — scope=universe, 술어 근거(pred) 포함", () => {
        // 시총 5,000억 이하 술어. 첫 틱 = 초기화(무장), marketCap 8000→3000 이 되는 종목이 엣지 발화.
        const rt = new AlertsRuntime(config([], { watchlist: [], universeRules: [uRule("u1", { name: "소형주" })] }), () => {});
        rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0); // 초기화(밖)
        rt.tick([quote("111111", 100, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000); // 진입 → 발화

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].scope).toBe("universe");
        expect(entries[0].delivery).toBe("sent");
        expect(entries[0].firing.note).toBe("소형주"); // 규칙 이름이 메모로
        expect(entries[0].firing.evidence).toEqual([{ kind: "pred", text: "시총 3,000억 (≤ 5,000억)" }]); // core evidence 문구
    });

    it("이미 조건 안인 종목의 첫 관찰은 초기화(발화 없음) — 신규 편입·재기동 폭풍 방지", () => {
        const rt = new AlertsRuntime(config([], { watchlist: [], universeRules: [uRule("u1")] }), () => {});
        rt.tick([quote("111111", 100, 0, { marketCap: 3_000 })], themesOf, prevClose, 0); // 첫 관찰부터 조건 안
        rt.tick([quote("111111", 100, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000); // 유지
        expect(rt.logSince(0).entries).toHaveLength(0);
    });

    it("signal 술어 — 30초 델타(링버퍼)가 임계를 넘는 순간 발화, 근거에 실측 델타", () => {
        const rule = uRule("sig", { predicates: [{ kind: "signal", params: { window: 0, rateMin: 0.4, tvMin: 40 } }] });
        const rt = new AlertsRuntime(config([], { watchlist: [], universeRules: [rule] }), () => {});
        const code = "222222";
        // t=0: 이력 없음 → 델타 없음 → false(초기화). t=35s: 30초 전 대비 +0.5%p·+45억 → true(엣지).
        const q0 = quote(code, 100, 0, { changeRate: 1.0, tradeValue: 10_000 }); // 대금 100억(백만원 단위)
        const q1 = quote(code, 105, 35_000, { changeRate: 1.5, tradeValue: 14_500 }); // +0.5%p·+45억
        rt.tick([q0], themesOf, prevClose, 0, depsFor({ [code]: [q0] }));
        rt.tick([q1], themesOf, prevClose, 35_000, depsFor({ [code]: [q0, q1] }));

        const { entries } = rt.logSince(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].firing.evidence[0]).toEqual({ kind: "pred", text: "30초 시그널 (+0.5%p · 45억)" });
    });

    it("output=log 규칙은 텔레그램에 안 가고(logOnly) 쿨다운도 소모하지 않는다", () => {
        const sinks: GateVerdict[] = [];
        const rt = new AlertsRuntime(config([], { watchlist: [], universeRules: [uRule("u1", { output: "log" })] }), (v) => sinks.push(v));
        rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
        rt.tick([quote("111111", 100, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000);

        expect(rt.logSince(0).entries[0].delivery).toBe("logOnly");
        expect(sinks.every((v) => v.passed.length === 0 && v.suppressed.length === 0)).toBe(true); // 게이트 밖
    });

    it("블랙리스트 종목은 텔레그램 차단(blacklisted)·로그엔 남음 — watchlist 룰은 무관", () => {
        const rt = new AlertsRuntime(
            config([priceRule("w1", "005930", 105)], { universeRules: [uRule("u1")], blacklist: ["005930"] }),
            () => {},
        );
        // 005930: watchlist 가격 룰 + 유니버스 시총 룰 둘 다 밖→안 진입.
        rt.tick([quote("005930", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
        rt.tick([quote("005930", 110, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000);

        const byScope = new Map(rt.logSince(0).entries.map((e) => [e.scope, e.delivery]));
        expect(byScope.get("universe")).toBe("blacklisted"); // 유니버스 → 차단
        expect(byScope.get("watchlist")).toBe("sent"); // 집중 감시는 목적이 달라 미적용
    });

    it("쿨다운 키 code(기본) — 다른 규칙이라도 같은 종목이면 억제 / codeRule — 규칙별 독립", () => {
        const mk = (key?: "code" | "codeRule"): UniverseRule[] => [
            uRule("a", { cooldownKey: key, cooldownMs: 60_000 }),
            uRule("b", { cooldownKey: key, cooldownMs: 60_000, predicates: [{ kind: "marketCap", params: { lteEok: 4_000 } }] }),
        ];
        const run = (key?: "code" | "codeRule"): string[] => {
            const rt = new AlertsRuntime(config([], { watchlist: [], universeRules: mk(key) }), () => {});
            rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0); // 둘 다 밖
            rt.tick([quote("111111", 100, 5_000, { marketCap: 3_000 })], themesOf, prevClose, 5_000); // 둘 다 진입(같은 틱)
            return rt.logSince(0).entries.map((e) => e.delivery);
        };
        // 같은 틱 두 규칙 발화: code 키 = 같은 키로 묶여 둘 다 한 배달(sent, sent) — 같은 틱은 한 묶음.
        expect(run("code")).toEqual(["sent", "sent"]);
        expect(run("codeRule")).toEqual(["sent", "sent"]);

        // 시차 발화: a 발화 후 b 가 나중에 걸리면 — code 키는 억제, codeRule 키는 통과.
        const later = (key?: "code" | "codeRule"): string => {
            const rt = new AlertsRuntime(config([], { watchlist: [], universeRules: mk(key) }), () => {});
            rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0);
            rt.tick([quote("111111", 100, 5_000, { marketCap: 4_500 })], themesOf, prevClose, 5_000); // a(≤5000)만 진입
            rt.tick([quote("111111", 100, 10_000, { marketCap: 3_000 })], themesOf, prevClose, 10_000); // b(≤4000) 진입
            const entries = rt.logSince(0).entries;
            return entries[entries.length - 1].delivery;
        };
        expect(later("code")).toBe("suppressed"); // 같은 종목 이미 알림 → 억제
        expect(later("codeRule")).toBe("sent"); // 규칙별 독립
    });

    it("유니버스 이탈 → 재편입은 초기화(조용) — hot 멤버십 churn 이 가짜 엣지를 안 만든다", () => {
        const rt = new AlertsRuntime(config([], { watchlist: [], universeRules: [uRule("u1")] }), () => {});
        rt.tick([quote("111111", 100, 0, { marketCap: 8_000 })], themesOf, prevClose, 0); // 무장(밖)
        rt.tick([], themesOf, prevClose, 5_000); // 유니버스 이탈 — 상태 소멸
        rt.tick([quote("111111", 100, 10_000, { marketCap: 3_000 })], themesOf, prevClose, 10_000); // 재편입, 조건 안 — 초기화
        expect(rt.logSince(0).entries).toHaveLength(0); // 발화 없음(보수적)
    });
});
