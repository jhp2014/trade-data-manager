// 알람 metrics 빌더 — 한 종목의 이번 틱 데이터를 core BoardMetrics 로 조립(순수).
// 이 어댑터가 제공하는 필드 집합 = core LIVE_ALARM_FIELDS(buckets 빼고 전부 + price·themeRankMap) —
// 실시간 술어(signal·marketCap·rank)와 watchlist 이관 술어(price·themeRank)가 여기서 열린다
// (requires⊆provides). 데이터 결손 필드는 생략 → evalPredicate 가 미결(undefined)로 판정하고,
// 결손 정책(스킵/false)은 엔진이 스코프별로 정한다.
import type { BoardMetrics, ByMarket, SignalDeltas, ThemeRankEntry } from "@trade-data-manager/market/domain";
import type { Quote } from "../engine/types.js";
import { rankKey, type PrevCloseLookup } from "./themeRank.js";

export interface UniverseMetricsDeps {
    themesOf(code: string): string[];
    prevCloseOf: PrevCloseLookup;
    /** 이번 틱 순위 맵(computeThemeRanks 결과, 키 code|theme|market). */
    ranks: Map<string, number>;
    /** ~60초 전 순위(RankTracker) — themeRank delta 모드 판정·표시용. */
    rankAgoOf(code: string, theme: string, market: "krx" | "un"): number | undefined;
    /** 30초·1분 원재료 델타(engine computeDeltas). 이력 부족이면 빈 객체. */
    deltasOf(code: string): SignalDeltas;
    /** 수정주가 트레일링 고가%(과거 완결일, dailyCtx). 미도착이면 undefined → 매물대 술어 불가. */
    trailingHighsOf(code: string): ByMarket<number[]> | undefined;
}

/** market 등락률 % — 그 시장 전일종가(없으면 ka10095 base 폴백, 클라 liveBaseOf 와 동일 규칙). */
function pctOf(value: number, code: string, market: "krx" | "un", deps: UniverseMetricsDeps, fallbackBase: number): number | null {
    const base = deps.prevCloseOf(code, market) ?? (fallbackBase > 0 ? fallbackBase : null);
    return base != null && base > 0 ? (value / base - 1) * 100 : null;
}

const MARKETS = ["krx", "un"] as const;

/** 종목 하나의 BoardMetrics — 알람 규칙 평가 입력. */
export function buildUniverseMetrics(q: Quote, deps: UniverseMetricsDeps): BoardMetrics {
    const highK = pctOf(q.high, q.code, "krx", deps, q.base);
    const highU = pctOf(q.high, q.code, "un", deps, q.base);

    // 트레일링 고가% — 클라(applyLiveFilter)와 같은 규칙: 시장별 index 0 에 당일 고가% prepend(장중 갱신 반영).
    // 일봉 컨텍스트 미도착이면 필드 생략 — [당일]만 넘기면 창최고=당일이라 "돌파"가 전 신규종목에 오발화한다.
    const th = deps.trailingHighsOf(q.code);
    const trailingHighs: ByMarket<number[]> | undefined = th
        ? {
              krx: highK != null ? [highK, ...th.krx] : [...th.krx],
              un: highU != null ? [highU, ...th.un] : [...th.un],
          }
        : undefined;

    // 이 종목의 테마 순위 — any-theme 리스트(rank 술어) + 테마별 맵(themeRank 술어, past 포함).
    const themes = deps.themesOf(q.code);
    const anyTheme: ByMarket<number[]> = { krx: [], un: [] };
    const themeRankMap: Record<string, Partial<ByMarket<ThemeRankEntry>>> = {};
    for (const t of themes) {
        for (const market of MARKETS) {
            const r = deps.ranks.get(rankKey(q.code, t, market));
            if (r == null) continue; // 그 시장 전일종가 미도착 → 그 칸 결손(themeRank 술어가 미결로)
            anyTheme[market].push(r);
            const past = deps.rankAgoOf(q.code, t, market);
            (themeRankMap[t] ??= {})[market] = past != null ? { rank: r, past } : { rank: r };
        }
    }
    const hasAnyRank = anyTheme.krx.length > 0 || anyTheme.un.length > 0;

    return {
        highPct: highU ?? 0, // 잣대 = UN(테마 보드·순위와 동일). 기준가 전무(신규 직후)면 0 — weakHigh 만 영향, 보수적.
        amount: q.tradeValue * 1_000_000, // 백만원 → 원(smallAmount 술어 잣대)
        price: q.price, // price 술어 — quote 는 항상 있으므로 결손 없음(결손=metrics 자체가 안 만들어짐)
        ...(trailingHighs ? { trailingHighs } : {}),
        ...(q.marketCap > 0 ? { marketCap: q.marketCap } : {}), // 0 = ka10095 결손 — "시총 이하" 오매칭 방지
        deltas: deps.deltasOf(q.code),
        ...(hasAnyRank ? { themeRanks: anyTheme } : {}), // 순위 전무(전일종가 미도착)면 결손 — rank 술어 미결
        themeRankMap, // 테마별 결손은 test3 가 칸 단위로 판정(맵 자체는 항상 제공)
    };
}
