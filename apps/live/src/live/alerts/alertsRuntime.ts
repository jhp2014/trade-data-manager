// 알람 런타임 — 엔진 틱에 끼어드는 평가 파이프라인(framework-free):
// 이번 틱 유니버스 시세 → 등락률 themeRank(KRX/UN) 계산 → 순위 이력 적재 → AlertEngine 평가 → 발화 sink + 로그.
// 엔진과의 결합은 watchCodes()(유니버스 합집합)와 tick()(평가) 두 지점뿐.
import type { Quote } from "../engine/types.js";
import { AlertEngine } from "./alertEngine.js";
import { computeThemeRanks, RankTracker, rankKey, type PrevCloseLookup } from "./themeRank.js";
import type { AlertConfigStore } from "./configStore.js";
import type { AlertFiring, WatchlistView } from "./types.js";

const FIRING_LOG_MAX = 100; // 최근 발화 메모리 상한(영속 안 함)

export type FiringSink = (firings: AlertFiring[]) => void;

export class AlertsRuntime {
    private readonly engine = new AlertEngine();
    private readonly tracker = new RankTracker();
    private readonly firings: AlertFiring[] = []; // 최신이 앞
    constructor(
        private readonly config: AlertConfigStore,
        private readonly sink: FiringSink,
    ) {}

    /** 엔진 유니버스에 합칠 타겟 종목들. */
    watchCodes(): string[] {
        return [...this.config.watchlist];
    }

    /**
     * 한 틱 평가 — 엔진이 시세 적재 직후 호출. quotes 는 이번 틱 유니버스(hot∪watchlist)의 신선한 시세만.
     * prevCloseOf = market 전일종가(등락률·순위 잣대) — 엔진의 일봉 컨텍스트에서 배급(미도착이면 그 leaf 미결).
     */
    tick(quotes: readonly Quote[], themesOf: (code: string) => string[], prevCloseOf: PrevCloseLookup, now: number): void {
        const ranks = computeThemeRanks(quotes, themesOf, prevCloseOf);
        this.tracker.push(ranks, now);
        const byCode = new Map(quotes.map((q) => [q.code, q] as const));
        const fired = this.engine.evaluate(this.config.rules, {
            quoteOf: (c) => byCode.get(c),
            prevCloseOf,
            rankOf: (c, t, m) => ranks.get(rankKey(c, t, m)),
            rankAgoOf: (c, t, m) => this.tracker.rankAgo(rankKey(c, t, m), now),
        }, now);
        if (fired.length === 0) return;
        this.firings.unshift(...fired);
        this.firings.length = Math.min(this.firings.length, FIRING_LOG_MAX);
        this.sink(fired);
    }

    /** 실시간 모니터링 패널 뷰 — 설정 + 조건 런타임 상태 + 최근 발화. */
    view(): WatchlistView {
        return {
            codes: [...this.config.watchlist],
            rules: this.config.rules.map((r) => {
                const s = this.engine.stateOf(r.id);
                return { ...r, inZone: s?.inZone, lastFiredAt: s?.lastFiredAt ?? null };
            }),
            firings: [...this.firings],
        };
    }
}
