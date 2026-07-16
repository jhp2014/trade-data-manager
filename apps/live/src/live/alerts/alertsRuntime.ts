// 알람 런타임 — 엔진 틱에 끼어드는 평가 파이프라인(framework-free):
// 이번 틱 유니버스 시세 → 등락률 themeRank(KRX/UN) 계산 → 순위 이력 적재 → AlertEngine 평가
// → **배달 게이트** → 로그 적재(전부, 배달 여부 포함) → sink(배달분·억제분).
// 엔진과의 결합은 watchCodes()(유니버스 합집합)와 tick()(평가) 두 지점뿐.
//
// 게이트가 여기 사는 이유: 로그가 "이건 텔레그램으로 갔고 저건 쿨다운에 막혔다"를 알아야 하는데,
// 그건 게이트 판정 결과다. 배선(live.module)에 두면 로그가 그 사실을 되받을 길이 없다.
import type { Quote } from "../engine/types.js";
import { AlertEngine } from "./alertEngine.js";
import { computeThemeRanks, RankTracker, rankKey, type PrevCloseLookup } from "./themeRank.js";
import { NotifyGate, type GatePolicy, type GateVerdict } from "./notifyGate.js";
import { DEFAULT_COOLDOWN_MS, type AlertFiring, type AlertLogEntry, type AlertLogView, type AlertRule, type WatchlistView } from "./types.js";

// 발화 1건 ≈ 1KB(V8) → 5,000건 ≈ 5MB. 서버 available 이 400MB 대라 사실상 공짜이고,
// 하루 발화가 이보다 적으면 자연히 당일치가 유지된다(날짜 리셋 로직 불필요).
const LOG_MAX = 5_000;

/** 런타임이 보는 설정 표면 — **읽기만**(ISP). 구체 구현 = AlertConfigStore(JSON 영속). */
export interface AlertConfigView {
    readonly watchlist: readonly string[];
    readonly rules: readonly AlertRule[];
}

/** 한 틱의 발화 처리 결과 — passed=텔레그램 배달분 / suppressed=쿨다운 억제분(로그엔 남는다). */
export type FiringSink = (verdict: GateVerdict) => void;

export class AlertsRuntime {
    private readonly engine = new AlertEngine();
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
     * prevCloseOf = market 전일종가(등락률·순위 잣대) — 엔진의 일봉 컨텍스트에서 배급(미도착이면 그 leaf 미결).
     * themesOf = 종목→테마들(로그 필터용으로 전체 테마를 싣는다).
     */
    tick(quotes: readonly Quote[], themesOf: (code: string) => string[], prevCloseOf: PrevCloseLookup, now: number): void {
        const ranks = computeThemeRanks(quotes, themesOf, prevCloseOf);
        this.lastRanks = ranks;
        this.tracker.push(ranks, now);
        const byCode = new Map(quotes.map((q) => [q.code, q] as const));
        const fired = this.engine.evaluate(this.config.rules, {
            quoteOf: (c) => byCode.get(c),
            prevCloseOf,
            rankOf: (c, t, m) => ranks.get(rankKey(c, t, m)),
            rankAgoOf: (c, t, m) => this.tracker.rankAgo(rankKey(c, t, m), now),
        }, now);
        if (fired.length === 0) return;

        const verdict = this.gate.pass(fired, (f) => this.policyOf(f), now);
        const notified = new Set(verdict.passed);
        for (const f of fired) {
            this.log.push({ seq: ++this.seq, firing: f, scope: "watchlist", themes: themesOf(f.code), notified: notified.has(f) });
        }
        if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
        this.sink(verdict);
    }

    /**
     * 배달 억제 정책 — watchlist 룰은 **룰별**("돌파"와 "이탈"은 서로 다른 사건이라 서로를 막지 않는다).
     * 유니버스 탐지 룰(브릭 4)이 들어오면 여기서 종목별 키로 분기한다.
     */
    private policyOf(f: AlertFiring): GatePolicy {
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
