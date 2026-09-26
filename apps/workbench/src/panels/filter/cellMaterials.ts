// 셀 재료 어댑터 — core 엔진(`evaluateCells`)이 요구하는 콜백 둘을 **기존 단일 출처**에 잇는다.
// 계산 규칙은 여기 없다(core 소유). 재계산기를 새로 쓰면 그 순간 "같은 화면에서 숫자가 둘"이 된다:
//  · 서수/존 순위 = `sectionAtMinute`(테마 순위 패널과 같은 stocks 배열 참조 → WeakMap 단면 캐시 공유)
//    + core `themeZone.themeAnswerOf`(타점 정보 패널과 같은 판정식).
//  · 격자 Point = `useAutoPoints`(defDerived 단일 파생 캐시)의 산출물.
//  · 돌파 사슬의 기준선 = `/point-grids` 의 `grid.base`(서버 리졸버 산출 — 기준선 편집 시 이미 무효화된다).
//
// 순수 함수인 이유: 훅이 아니어야 dom 테스트 없이 잠글 수 있고, 호출부(useCellSet)의 memo 신원이
// 재료 한 벌로 모인다(어댑터가 훅이면 의존 배열이 갈려 매 렌더 새 참조가 된다).
import { themeAnswerOf, type CellMaterials } from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { autoPointsOfChart } from "../../lib/PointGridsContext.js";
import type { AutoPointsView } from "../../lib/usePointGrids.js";
import type { ThemeProjection } from "@trade-data-manager/market/domain";
import { themeSectionAt } from "../themeRank/sectionSeries.js";

/**
 * 하루 재료 한 벌. `themeAt` 은 **비싼 쪽**이라 엔진의 단락 뒤에서만 불린다 — 분 단면은
 * sectionSeries 공용 캐시(표시와 같은 물건), 파라미터는 술어 payload 로 온다(옛 공용 노브 사다리 폐지).
 */
export function cellMaterialsOf(
    stocks: readonly ReplayStock[],
    date: string,
    auto: AutoPointsView,
    proj: ThemeProjection,
    /** 돌파 사슬의 기준선(원주가) — 안 쓰면 생략(부재 = 기준선 없음 → 이름표가 전부 「고가 돌파」). */
    baselineOf?: (code: string) => number | null,
): CellMaterials {
    return {
        ...(baselineOf ? { baselineOf } : {}),
        gridMinutesOf: (code) => autoPointsOfChart(auto, code, date).map((p) => p.min),
        // 테마 술어 — 판정은 core themeAnswerOf 하나(계산 규칙을 여기 두지 않는다). 단면은 sectionSeries
        // 공용 캐시라 표시(테마 순위 판)와 같은 물건을 본다. 파라미터는 payload 로 술어마다 온다.
        themeAt: (code, min, p) => themeAnswerOf(code, themeSectionAt(stocks, date, min, p.window), p, proj),
    };
}
