// 탐색 후보 배선 — core 셀 엔진(`evaluateCells`)에 하루 재료를 물린다.
//  · 하루 재료 = useDaySnapshot(/day-replay LRU) — 테마 순위·정규화 패널과 **같은 stocks 배열**이라
//    sectionSeries 의 분 단면 캐시(WeakMap 키 = 배열 참조)를 그대로 나눠 쓴다.
//  · 서수/존 순위·격자 Point 는 `cellMaterialsOf` 어댑터가 기존 단일 출처에 잇는다(재계산기 금지).
// 값은 어디에도 저장되지 않는다(후보는 진실이 아니다 — decisions.md 「집합 = (낟알, 우주, 조건)」).
//
// 재료 게이트는 **조건이 실제로 그 재료를 쓸 때만** 선다(usesGridPoint/usesZoneRank) — 노브 불린에
// 물려 두면 "격자 칸을 지웠는데 격자 로딩 실패가 패널을 죽인다"가 조용히 생긴다.
import { useMemo } from "react";
import {
    evaluateCells,
    usesGridPoint,
    usesZoneRank,
    type CellConditions,
    type CellEvalOptions,
    type CellHit,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { useAutoPoints } from "../../lib/PointGridsContext.js";
import { useThemeProjection } from "../../lib/useThemeProjection.js";
import { useThemeKnobParams } from "../filter/themeLink.js";
import { cellMaterialsOf } from "./cellMaterials.js";

export interface ProbesView {
    /** 정렬·상한이 적용된 목록 — **순회도 렌더도 이 배열 하나만 본다**. */
    hits: readonly CellHit[];
    /** 상한 전 총 발화 셀 수(tooWide 면 확인된 최소치). */
    matched: number;
    limit: number;
    truncated: boolean;
    /** 조건이 너무 넓다 — 목록 대신 그 사실을 말해야 한다. */
    tooWide: boolean;
    /** 조건 id → 걸린 수. 칸이 곧 로직이라는 모델의 화면 증거. */
    byCondition: ReadonlyMap<string, number>;
    /** 이름·메타 조회(행 표시용) — 스냅샷의 종목 그대로. */
    byCode: ReadonlyMap<string, ReplayStock>;
    isLoading: boolean;
    error: Error | null;
    /** 존 순위 재료 준비 여부 — 멤버십 로딩 중엔 그 칸이 조용히 비므로 화면이 모름을 말할 재료. */
    themesReady: boolean;
}

const EMPTY_HITS: CellHit[] = [];
const EMPTY_MAP = new Map<string, ReplayStock>();
const EMPTY_COUNTS = new Map<string, number>();

export function useProbes(date: string, conditions: CellConditions, opts?: CellEvalOptions): ProbesView {
    const snapQ = useDaySnapshot(date);
    const stocks = snapQ.data?.stocks;
    const auto = useAutoPoints();
    const themes = useThemeProjection();
    // 존 정의(N·M·창·기준)는 공용 사다리 — 타점 정보 패널과 같은 숫자를 낸다(두 화면 두 숫자 금지).
    const zoneParams = useThemeKnobParams();

    const needsGrid = useMemo(() => usesGridPoint(conditions), [conditions]);
    const needsZone = useMemo(() => usesZoneRank(conditions), [conditions]);
    const limit = opts?.limit;
    const hardCap = opts?.hardCap;

    const result = useMemo(() => {
        if (!stocks || snapQ.data?.date !== date) return null;
        const mat = cellMaterialsOf(stocks, date, auto, themes.proj, zoneParams);
        return evaluateCells(stocks, mat, conditions, { ...(limit !== undefined ? { limit } : {}), ...(hardCap !== undefined ? { hardCap } : {}) });
    }, [stocks, snapQ.data?.date, date, auto, themes.proj, zoneParams, conditions, limit, hardCap]);

    const byCode = useMemo<ReadonlyMap<string, ReplayStock>>(
        () => (stocks ? new Map(stocks.map((s) => [s.code, s])) : EMPTY_MAP),
        [stocks],
    );

    return {
        hits: result?.hits ?? EMPTY_HITS,
        matched: result?.matched ?? 0,
        limit: result?.limit ?? 0,
        truncated: result?.truncated ?? false,
        tooWide: result?.tooWide ?? false,
        byCondition: result?.byCondition ?? EMPTY_COUNTS,
        byCode,
        // 격자 의존(로딩·오류)은 **그 재료를 쓰는 조건이 있을 때만** 겉으로 낸다 — 칸을 지웠는데
        // 격자 실패가 패널을 죽이면 "지웠다"가 거짓말이 된다(둘 다 같은 게이트).
        isLoading: snapQ.isLoading || (needsGrid && auto.isLoading),
        error: (snapQ.error as Error | null) ?? (needsGrid ? auto.error : null),
        themesReady: !needsZone || themes.ready,
    };
}
