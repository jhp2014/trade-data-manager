// 유니버스 알람 metrics 빌더 — 한 종목의 이번 틱 데이터를 core BoardMetrics 로 조립(순수).
// 이 어댑터가 제공하는 필드 집합 = core LIVE_ALARM_FIELDS(buckets 빼고 전부) — 조각 1 의 실시간 술어
// (signal·marketCap·rank)가 여기서 처음 열린다(requires⊆provides). 데이터 결손 필드는 생략 →
// 그 술어는 false(매칭 안 함) → 발화 없음. 도착하면 다음 틱부터 평가(엣지라 도착 자체로 폭풍 없음).
import type { BoardMetrics, ByMarket, SignalDeltas } from "@trade-data-manager/market/domain";
import type { Quote } from "../engine/types.js";
import { rankKey, type PrevCloseLookup } from "./themeRank.js";

export interface UniverseMetricsDeps {
    themesOf(code: string): string[];
    prevCloseOf: PrevCloseLookup;
    /** 이번 틱 순위 맵(computeThemeRanks 결과, 키 code|theme|market). */
    ranks: Map<string, number>;
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

/** 종목 하나의 BoardMetrics — 유니버스 규칙 평가 입력. */
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

    // 이 종목의 테마별 순위(시장별) — any-theme rank 술어 입력. 순위 없는 (테마×시장)은 제외.
    const themes = deps.themesOf(q.code);
    const rankList = (market: "krx" | "un"): number[] => {
        const out: number[] = [];
        for (const t of themes) {
            const r = deps.ranks.get(rankKey(q.code, t, market));
            if (r != null) out.push(r);
        }
        return out;
    };

    return {
        highPct: highU ?? 0, // 잣대 = UN(테마 보드·순위와 동일). 기준가 전무(신규 직후)면 0 — weakHigh 만 영향, 보수적.
        amount: q.tradeValue * 1_000_000, // 백만원 → 원(smallAmount 술어 잣대)
        ...(trailingHighs ? { trailingHighs } : {}),
        ...(q.marketCap > 0 ? { marketCap: q.marketCap } : {}), // 0 = ka10095 결손 — "시총 이하" 오매칭 방지
        deltas: deps.deltasOf(q.code),
        ranks: { krx: rankList("krx"), un: rankList("un") },
    };
}
