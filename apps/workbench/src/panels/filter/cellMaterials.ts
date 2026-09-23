// 셀 재료 어댑터 — core 엔진(`evaluateCells`)이 요구하는 콜백 둘을 **기존 단일 출처**에 잇는다.
// 계산 규칙은 여기 없다(core 소유). 재계산기를 새로 쓰면 그 순간 "같은 화면에서 숫자가 둘"이 된다:
//  · 서수/존 순위 = `sectionAtMinute`(테마 순위 패널과 같은 stocks 배열 참조 → WeakMap 단면 캐시 공유)
//    + `themeStrength.themeStatsOf`(타점 정보 패널과 같은 판정식).
//  · 격자 Point = `useAutoPoints`(defDerived 단일 파생 캐시)의 산출물.
//  · 돌파 사슬의 기준선 = `/point-grids` 의 `grid.base`(서버 리졸버 산출 — 기준선 편집 시 이미 무효화된다).
//
// 순수 함수인 이유: 훅이 아니어야 dom 테스트 없이 잠글 수 있고, 호출부(useCellSet)의 memo 신원이
// 재료 한 벌로 모인다(어댑터가 훅이면 의존 배열이 갈려 매 렌더 새 참조가 된다).
import type { CellMaterials } from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { autoPointsOfChart } from "../../lib/PointGridsContext.js";
import type { AutoPointsView } from "../../lib/usePointGrids.js";
import { inZone, themeStatsOf, type SectionRanks, type ThemeProjection, type ThemeStrengthParams } from "../../lib/themeStrength.js";
import { sectionAtMinute } from "../themeRank/sectionSeries.js";

/**
 * 하루 재료 한 벌. `zoneRankAt` 은 **비싼 쪽**이라 엔진의 단락 뒤에서만 불린다 —
 * 그래서 분 단면 캐시(ranksCache)가 실제로 몇 백 번만 채워진다(옛 probe 는 zoneOn 이면 전 분을 구웠다).
 */
export function cellMaterialsOf(
    stocks: readonly ReplayStock[],
    date: string,
    auto: AutoPointsView,
    proj: ThemeProjection,
    zoneParams: ThemeStrengthParams,
    /** 돌파 사슬의 기준선(원주가) — 안 쓰면 생략(부재 = 기준선 없음 → 이름표가 전부 「고가 돌파」). */
    baselineOf?: (code: string) => number | null,
): CellMaterials {
    const idx = new Map(stocks.map((s, i) => [s.code, i] as const));
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

    return {
        ...(baselineOf ? { baselineOf } : {}),
        gridMinutesOf: (code) => autoPointsOfChart(auto, code, date).map((p) => p.min),
        zoneRankAt: (code, min) => {
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
        },
    };
}
