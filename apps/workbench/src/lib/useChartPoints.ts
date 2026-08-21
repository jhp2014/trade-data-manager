// 이 차트(종목,날짜)의 복기 타점 — **읽기 포트**. 재료는 큐레이션 복제본(all-points 테이블 키)이라
// 서버 왕복이 없다(종목 이동에도 즉시). 소비자는 재료가 복제본인지 서버인지 모른다(usePresence 와 같은 결).
//
// select 는 useCallback 으로 고정 — RQ 는 (data, select) 쌍으로 결과를 메모하므로 렌더마다 새 함수면
// 필터가 매번 다시 돈다. 무관한 차트의 타점 변경으로 테이블이 재조회돼도 이 차트 조각이 deep-equal 이면
// structural sharing 이 옛 참조를 유지해 재렌더가 없다(per-chart 키 시절과 같은 격리).
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReviewPoint } from "../api/reviewPoints.js";
import { allPointsQuery } from "../api/queries.js";

const EMPTY: ReviewPoint[] = [];

/** 그 (종목,날짜)의 타점 — 전량 피드가 같은 날 시각 오름차순이라 필터 결과도 시각 오름차순. */
export function useChartPoints(code: string, date: string): ReviewPoint[] {
    const select = useCallback(
        (all: ReviewPoint[]) => all.filter((p) => p.stockCode === code && p.date === date),
        [code, date],
    );
    return useQuery({ ...allPointsQuery(), select }).data ?? EMPTY;
}
