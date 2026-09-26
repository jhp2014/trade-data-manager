// 자동 타점 격자 — **읽기 포트**(번들 통째 + O(1) 조회) + 자동 Point 파생 뷰의 훅.
//
// 격자는 서버 파일 캐시의 압축물(구조·신고가 목록)이고, Point 는 정의(pointDefSlice) 한 벌로 즉석
// 파생한다 — 계산 주체는 core pointsOf(서버 recon 과 같은 함수), 계산 자리는 **정의별 캐시 한 곳**
// (defDerived — 정의를 오가도 같은 판정 키면 재파생이 없다). 파생을 그 캐시 밖에서 또 돌리면
// 1만 객체가 화면 수만큼 복제되므로, 소비자(시트·깔때기·차트 마커)는 전부 이 훅의 산출물을 본다.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PointGrid } from "@trade-data-manager/market/domain";
import { pointGridsQuery } from "../api/queries.js";

export interface PointGridsView {
    isLoading: boolean;
    /** 첫 로드 실패 — 빈 번들을 "격자 없음"으로 오독하지 않게 겉으로 낸다. */
    error: Error | null;
    /** (종목, 날짜) → 격자. 없으면 undefined(기준선 미확정·재료 없음 — 결손은 결손). */
    gridOf(code: string, date: string): PointGrid | undefined;
    /** 전수 순회 소비자용(게이트 분포 등) — 낟알 조회는 `gridOf`. 로딩 전엔 null. */
    byDate: ReadonlyMap<string, ReadonlyMap<string, PointGrid>> | null;
    version: number | null;
}

/** ⚠ 직접 부르지 말 것 — PointGridsProvider 가 유일한 호출자다(소비는 PointGridsContext 의 usePointGrids). */
export function usePointGridsValue(): PointGridsView {
    const q = useQuery(pointGridsQuery());
    return useMemo<PointGridsView>(() => {
        const data = q.data ?? null;
        return {
            isLoading: q.isLoading,
            error: (q.error as Error | null) ?? null,
            gridOf: (code, date) => data?.byDate.get(date)?.get(code),
            byDate: data?.byDate ?? null,
            version: data?.version ?? null,
        };
    }, [q.data, q.isLoading, q.error]);
}
