// 알람 런타임 — 엔진 틱에 끼어드는 평가 파이프라인(framework-free):
// 이번 틱 유니버스 시세 → 등락률 themeRank(KRX/UN) → 순위 이력 적재 → [watchlist AlertEngine +
// 유니버스 UniverseAlertEngine] 평가 → 테마 컨텍스트 부착 → **배달 판정** → 로그 적재(전부) → sink.
// 엔진과의 결합은 watchCodes()(유니버스 합집합)와 tick()(평가) 두 지점뿐.
//
// 배달 모델(로그 ⊇ 텔레그램 불변식):
//  · 로그 = 모든 발화(쿨다운·블랙리스트·로그전용 전부) — PC 앞에서 시장 전체를 보는 자리.
//  · 텔레그램 = 부분집합: output=telegram 규칙 ∧ 블랙리스트 아님 ∧ 쿨다운 통과.
//  · 쿨다운은 소비자(텔레그램) 정책 — 키는 watchlist=룰별(사실상 종목×룰), 유니버스=규칙 설정
//    (code=종목 넓게 / codeRule=종목×규칙 디테일). 로직은 NotifyGate 공유.
import type { Quote } from "../engine/types.js";
import type { ByMarket, SignalDeltas } from "@trade-data-manager/market/domain";
import { AlertEngine } from "./alertEngine.js";
import { UniverseAlertEngine } from "./universeEngine.js";
import { buildUniverseMetrics } from "./universeMetrics.js";
import { computeDeltas } from "../engine/signals.js";
import { buildThemeContext, computeThemeRanks, RankTracker, rankKey, type PrevCloseLookup } from "./themeRank.js";
import { NotifyGate, type GatePolicy, type GateVerdict } from "./notifyGate.js";
import {
    DEFAULT_COOLDOWN_MS,
    type AlertDelivery,
    type AlertFiring,
    type AlertLogEntry,
    type AlertLogView,
    type AlertRule,
    type BlacklistEntry,
    type UniverseRule,
    type WatchlistView,
} from "./types.js";

// 발화 1건 ≈ 1KB(V8) → 5,000건 ≈ 5MB. 서버 available 이 400MB 대라 사실상 공짜이고,
// 하루 발화가 이보다 적으면 자연히 당일치가 유지된다(날짜 리셋 로직 불필요).
const LOG_MAX = 5_000;

/** 런타임이 보는 설정 표면 — **읽기만**(ISP). 구체 구현 = AlertConfigStore(JSON 영속). */
export interface AlertConfigView {
    readonly watchlist: readonly string[];
    readonly rules: readonly AlertRule[];
    readonly universeRules: readonly UniverseRule[];
    activeBlacklist(now: number): readonly BlacklistEntry[];
}

/** 유니버스 metrics 조립에 필요한 엔진 데이터(링버퍼·일봉 컨텍스트) — 엔진이 tick 에 주입. */
export interface AlertTickDeps {
    historyOf(code: string): readonly Quote[];
    trailingHighsOf(code: string): ByMarket<number[]> | undefined;
}

/** 한 틱의 텔레그램 배달 결과 — passed=배달분 / suppressed=쿨다운 억제분(로그엔 남는다). */
export type FiringSink = (verdict: GateVerdict) => void;

export class AlertsRuntime {
    private readonly engine = new AlertEngine();
    private readonly uEngine = new UniverseAlertEngine();
    private readonly tracker = new RankTracker();
    private readonly gate = new NotifyGate();
    private readonly log: AlertLogEntry[] = []; // seq 오름차순(오래된 것이 앞) — 증분 커서와 같은 방향
    private seq = 0;
    private lastRanks = new Map<string, number>(); // 이번 틱 순위(code|theme|market) — 모니터링 표시용

    constructor(
        private readonly config: AlertConfigView,
        private readonly sink: FiringSink,
    ) {}

    /** 엔진 유니버스에 합칠 타겟 종목들. */
    watchCodes(): string[] {
        return [...this.config.watchlist];
    }

    /**
     * 한 틱 평가 — 엔진이 시세 적재 직후 호출. quotes 는 이번 틱 유니버스(hot∪watchlist)의 신선한 시세만.
     * prevCloseOf = market 전일종가(등락률·순위 잣대), deps = 링버퍼·일봉 컨텍스트(유니버스 metrics 용).
     */
    tick(quotes: readonly Quote[], themesOf: (code: string) => string[], prevCloseOf: PrevCloseLookup, now: number, deps?: AlertTickDeps): void {
        const ranks = computeThemeRanks(quotes, themesOf, prevCloseOf);
        this.lastRanks = ranks;
        this.tracker.push(ranks, now);
        const byCode = new Map(quotes.map((q) => [q.code, q] as const));

        // ① watchlist 룰 평가(종목 귀속, 3치 논리)
        const wFired = this.engine.evaluate(this.config.rules, {
            quoteOf: (c) => byCode.get(c),
            prevCloseOf,
            rankOf: (c, t, m) => ranks.get(rankKey(c, t, m)),
            rankAgoOf: (c, t, m) => this.tracker.rankAgo(rankKey(c, t, m), now),
        }, now);

        // ② 유니버스 규칙 평가(조건검색식 — 술어는 core 레지스트리). metrics 는 종목별 1회 메모이즈.
        const uRules = this.config.universeRules;
        let uFired: AlertFiring[] = [];
        if (uRules.length > 0) {
            const mCache = new Map<string, ReturnType<typeof buildUniverseMetrics>>();
            const metricsOf = (code: string): ReturnType<typeof buildUniverseMetrics> => {
                let m = mCache.get(code);
                if (!m) {
                    const q = byCode.get(code)!; // 유니버스 순회라 항상 존재
                    m = buildUniverseMetrics(q, {
                        themesOf,
                        prevCloseOf,
                        ranks,
                        deltasOf: (c): SignalDeltas => (deps ? computeDeltas(deps.historyOf(c), now) : {}),
                        trailingHighsOf: (c) => deps?.trailingHighsOf(c),
                    });
                    mCache.set(code, m);
                }
                return m;
            };
            uFired = this.uEngine.evaluate(uRules, quotes, metricsOf, now);
        }

        const fired = [...wFired, ...uFired];
        if (fired.length === 0) return;

        // ③ 테마 상황 스냅샷 — 종목별 1회(같은 틱 여러 발화·같은 종목이면 재사용). 발화 시점 데이터라 여기서만.
        const ctxCache = new Map<string, AlertFiring["themeContext"]>();
        for (const f of fired) {
            if (!ctxCache.has(f.code)) ctxCache.set(f.code, buildThemeContext(f.code, quotes, themesOf, prevCloseOf, ranks));
            f.themeContext = ctxCache.get(f.code);
        }

        // ④ 배달 판정 — 로그전용·블랙리스트는 게이트 밖(쿨다운 상태를 소모하지 않음), 나머지만 게이트.
        const uRuleById = new Map(uRules.map((r) => [r.id, r] as const));
        const blacklisted = new Set(this.config.activeBlacklist(now).map((b) => b.code));
        const preDelivery = new Map<AlertFiring, AlertDelivery>();
        const gateEligible: AlertFiring[] = [];
        for (const f of fired) {
            const uRule = uRuleById.get(f.ruleId);
            if (uRule && blacklisted.has(f.code)) preDelivery.set(f, "blacklisted");
            else if (uRule && uRule.output === "log") preDelivery.set(f, "logOnly");
            else gateEligible.push(f);
        }
        const verdict = this.gate.pass(gateEligible, (f) => this.policyOf(f, uRuleById), now);
        for (const f of verdict.passed) preDelivery.set(f, "sent");
        for (const f of verdict.suppressed) preDelivery.set(f, "suppressed");

        // ⑤ 로그 적재(전부) — 로그 ⊇ 텔레그램.
        for (const f of fired) {
            this.log.push({
                seq: ++this.seq,
                firing: f,
                scope: uRuleById.has(f.ruleId) ? "universe" : "watchlist",
                themes: themesOf(f.code),
                delivery: preDelivery.get(f) ?? "suppressed",
            });
        }
        if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
        this.sink(verdict);
    }

    /**
     * 텔레그램 쿨다운 정책(키+기간) — watchlist 룰은 룰별(= 사실상 종목×룰: 룰이 code 귀속이라).
     * 유니버스 룰은 설정: code(종목 단위, 기본 — 조건 OR 중복 알람 방지) / codeRule(종목×규칙 디테일).
     */
    private policyOf(f: AlertFiring, uRuleById: ReadonlyMap<string, UniverseRule>): GatePolicy {
        const uRule = uRuleById.get(f.ruleId);
        if (uRule) {
            return {
                key: uRule.cooldownKey === "codeRule" ? `${f.code}|${f.ruleId}` : f.code,
                cooldownMs: uRule.cooldownMs ?? DEFAULT_COOLDOWN_MS,
            };
        }
        return { key: f.ruleId, cooldownMs: this.config.rules.find((r) => r.id === f.ruleId)?.cooldownMs ?? DEFAULT_COOLDOWN_MS };
    }

    /** 발화 로그 증분 — since 초과분만(오름차순). latestSeq < since 면 서버가 재시작된 것(클라가 리셋). */
    logSince(since: number): AlertLogView {
        return { entries: since <= 0 ? [...this.log] : this.log.filter((e) => e.seq > since), latestSeq: this.seq };
    }

    /** 실시간 모니터링 패널 뷰 — 설정 + 조건 런타임 상태 + watchlist 종목 현재 순위(발화 목록은 로그가 소유). */
    view(): WatchlistView {
        const watch = new Set(this.config.watchlist);
        const ranks: Record<string, number> = {};
        for (const [key, rank] of this.lastRanks) {
            if (watch.has(key.slice(0, key.indexOf("|")))) ranks[key] = rank; // key = code|theme|market
        }
        return {
            codes: [...this.config.watchlist],
            rules: this.config.rules.map((r) => {
                const s = this.engine.stateOf(r.id);
                return { ...r, inZone: s?.inZone, lastFiredAt: s?.lastFiredAt ?? null };
            }),
            ranks,
        };
    }
}
