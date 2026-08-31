// point 행 원천 — 시트·깔때기·작업셋·레일이 보는 **한 곳**. 출처 토글(auto/hand)이 여기서만 갈린다.
//
// auto = 격자 파생(useAutoPoints — 정의 반영, outcome/memo 없음), hand = 수동 review_points.
// 합집합은 만들지 않는다(같은 분의 키 충돌 + 출처 불명 화면). 차트의 저장/삭제 판정(useChartPoints)은
// 손 타점 고정이라 이 토글의 영향 밖 — space 토글이 자동 행을 지우려 드는 사고가 없다.
import { useMemo } from "react";
import type { ReviewPoint } from "../api/reviewPoints.js";
import { useWorkbench } from "../store/workbench.js";
import { useAllPoints } from "./useAllPoints.js";
import { useAutoPoints } from "./usePointGrids.js";

export interface PointRowsView {
    /** 날짜 내림차순, 같은 날 시각 오름차순(useAllPoints 피드 정렬과 동일 계약). */
    points: ReviewPoint[];
    isLoading: boolean;
    error: Error | null;
    source: "auto" | "hand";
}

const EMPTY: ReviewPoint[] = [];

export function usePointRows(): PointRowsView {
    const source = useWorkbench((s) => s.pointSource);
    const hand = useAllPoints();
    const auto = useAutoPoints();
    return useMemo<PointRowsView>(() => {
        if (source === "hand") return { ...hand, source };
        const points: ReviewPoint[] = auto.points
            .map((a) => ({ stockCode: a.stockCode, date: a.date, time: a.time }))
            .sort((x, y) => (x.date !== y.date ? (x.date < y.date ? 1 : -1) : x.time < y.time ? -1 : x.time > y.time ? 1 : 0));
        return { points: points.length > 0 ? points : EMPTY, isLoading: auto.isLoading, error: auto.error, source };
    }, [source, hand, auto]);
}
