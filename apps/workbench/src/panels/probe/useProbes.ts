// 탐색 후보 배선 — core probesOfDay(판정 규칙)에 기존 단일 출처들을 콜백으로 잇는다.
//  · 하루 재료 = useDaySnapshot(/day-replay LRU) — 테마 순위·정규화 패널과 **같은 stocks 배열**이라
//    sectionSeries 의 분 단면 캐시(WeakMap 키 = 배열 참조)를 그대로 나눠 쓴다.
//  · 서수/존 순위 = sectionAtMinute + themeStrength.themeStatsOf(서수 출처 단일화 — 재계산기 금지).
//  · 격자 Point = useAutoPoints(defDerived 단일 파생 캐시)의 산출물 주입 — pointsOf 재파생 금지.
// 값은 어디에도 저장되지 않는다(후보는 진실이 아니다 — decisions.md 「구조 개편」).
import { useMemo } from "react";
import {
    probesOfDay,
    type ProbeHit,
    type ProbeParams,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { autoPointsOfChart, useAutoPoints } from "../../lib/PointGridsContext.js";
import { useThemeProjection } from "../../lib/useThemeProjection.js";
import { inZone, themeStatsOf, type SectionRanks } from "../../lib/themeStrength.js";
import { useThemeKnobParams } from "../filter/themeLink.js";
import { sectionAtMinute } from "../themeRank/sectionSeries.js";

export interface ProbesView {
    hits: readonly ProbeHit[];
    /** 이름·메타 조회(행 표시용) — 스냅샷의 종목 그대로. */
    byCode: ReadonlyMap<string, ReplayStock>;
    isLoading: boolean;
    error: Error | null;
    /** ④(존 순위) 재료 준비 여부 — 멤버십 로딩 중엔 존 태그가 조용히 비므로 화면이 모름을 말할 재료. */
    themesReady: boolean;
}

const EMPTY_HITS: ProbeHit[] = [];
const EMPTY_MAP = new Map<string, ReplayStock>();

export function useProbes(date: string, params: ProbeParams): ProbesView {
    const snapQ = useDaySnapshot(date);
    const stocks = snapQ.data?.stocks;
    const auto = useAutoPoints();
    const themes = useThemeProjection();
    // 존 정의(N·M·창·기준)는 공용 사다리 — 타점 정보 패널과 같은 숫자를 낸다(두 화면 두 숫자 금지).
    const zoneParams = useThemeKnobParams();

    const hits = useMemo<readonly ProbeHit[]>(() => {
        if (!stocks || snapQ.data?.date !== date) return EMPTY_HITS;
        const idx = new Map(stocks.map((s, i) => [s.code, i] as const));
        // 분 단면 어댑터 — RankSection(배열) 위의 O(1) ranksOf. 캐시 낟알은 분(단면 자체는 sectionSeries 공용).
        const ranksCache = new Map<number, SectionRanks>();
        const ranksAt = (min: number): SectionRanks => {
            let r = ranksCache.get(min);
            if (!r) {
                const sec = sectionAtMinute(stocks, date, min);
                r = {
                    ranksOf: (code) => {
                        const i = idx.get(code);
                        if (i === undefined) return null;
                        return { rate: sec.rate[i], amount: sec.amount[i], amount60: sec.amount60[i] };
                    },
                };
                ranksCache.set(min, r);
            }
            return r;
        };
        const proj = themes.proj;
        const zoneRankAt = (code: string, min: number): { rank: number; theme: string } | null => {
            const memberOf = proj.themesByCode.get(code);
            if (!memberOf || memberOf.length === 0) return null;
            const section = ranksAt(min);
            const self = section.ranksOf(code);
            // 선거름 — 존 밖이면 zoneRank 는 정의상 null(themeStatsOf 와 같은 판정식 inZone).
            if (self === null || !inZone(self, zoneParams)) return null;
            let best: { rank: number; theme: string } | null = null;
            for (const theme of memberOf) {
                const st = themeStatsOf(code, theme, section, zoneParams, proj);
                if (st?.zoneRank != null && (best === null || st.zoneRank < best.rank)) best = { rank: st.zoneRank, theme };
            }
            return best;
        };
        const gridMinutesOf = (code: string): readonly number[] =>
            autoPointsOfChart(auto, code, date).map((p) => p.min);
        return probesOfDay(stocks, { gridMinutesOf, zoneRankAt }, params);
    }, [stocks, snapQ.data?.date, date, auto, themes.proj, zoneParams, params]);

    const byCode = useMemo<ReadonlyMap<string, ReplayStock>>(
        () => (stocks ? new Map(stocks.map((s) => [s.code, s])) : EMPTY_MAP),
        [stocks],
    );

    return {
        hits,
        byCode,
        // 격자 의존(로딩·오류)은 gridOn 일 때만 겉으로 낸다 — 노브를 껐는데 격자 실패가 패널을 죽이면
        // "끄기"가 거짓말이 된다(둘 다 같은 게이트).
        isLoading: snapQ.isLoading || (params.gridOn && auto.isLoading),
        error: (snapQ.error as Error | null) ?? (params.gridOn ? auto.error : null),
        themesReady: themes.ready,
    };
}
