// 깔때기 결과 어댑터 — 시트·분석이 쓰던 "필터 결과" 모양을 **깔때기의 보는 집합**에서 파생한다.
//
// 옛 구현은 평평한 전역 필터(밴드·값구간·날짜·시간·그룹)를 여기서 직접 평가했다. 이제 조건은 깔때기
// 단계에만 살고 판정·정산도 거기서 끝난다 — 여기 남은 일은 두 가지뿐이다:
//   · 보는 집합(viewedItems)을 **타점으로 펼쳐** 소비자가 기대하는 알갱이로 맞춘다(하루 조건은 그날
//     전 타점에 같은 값이라 정직한 반복).
//   · 경로 통계(paths·stats·MFE/MAE)를 그 타점들 위에서 낸다 — 이건 필터가 아니라 분석의 일이라 남는다.
//
// ⚠ 소비자가 조건을 다시 평가하지 않는 게 요점이다. 조건을 나눠 주면 패널마다 판정이 갈라져
// 서로 다른 답을 낸다(옛 필터 UI 가 두 곳이라 생겼던 문제와 같은 종류).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { allPointsQuery } from "../../api/queries.js";
import { computePathStats, type PathStats } from "./pathStats.js";
import { useRankPaths } from "./useRankPaths.js";
import { pointKey } from "../../lib/pointKey.js";
import { useWorkbench } from "../../store/workbench.js";
import { useFilterFunnel } from "../filter/useFilterFunnel.js";
import { stageLabel } from "../filter/label.js";
import type { RankPoint } from "../../api/rank.js";
import type { RankPointPath } from "../../api/rankPaths.js";

export interface PointMeta { outcome?: string }

export interface RankResult {
    /** 아무 조건도 시선도 없음 — 소비자는 "필터 없음"으로 그린다(전체·흐림 없음·결과 열 없음). */
    isEmpty: boolean;
    isLoading: boolean;
    /** 보는 집합의 타점들. 필터 없음이면 전 타점(옛 동작 보존 — 시트가 이걸 전체 행으로 쓴다). */
    points: RankPoint[];
    /** 분모 표시용 — 깔때기 유니버스(후보 하루 또는 그 타점 전개) 크기. */
    coverage: number;
    paths: RankPointPath[];
    stats: PathStats;
    effHorizon: number;
    dataMinT: number; // 최소 t(진입 전 = 음수)
    dataMaxT: number;
    /** 활성 단계 이름들(분석 헤더 칩) — 옛 activeAxisNames 자리. */
    stageLabels: string[];
    nameOf: (code: string) => string;
    metaOf: (key: string) => PointMeta;
}

export function useRankFilterResult(): RankResult {
    const funnel = useFilterFunnel();
    const rankHorizon = useWorkbench((s) => s.rankHorizon);

    const pointsQ = useQuery(allPointsQuery());
    const nameOf = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        return (code: string): string => m.get(code) ?? code;
    }, [pointsQ.data]);
    const metaOf = useMemo(() => {
        const m = new Map<string, PointMeta>();
        for (const p of pointsQ.data ?? []) m.set(pointKey(p), { outcome: p.outcome });
        return (k: string): PointMeta => m.get(k) ?? {};
    }, [pointsQ.data]);

    // 필터 없음 = 보는 집합이 유니버스 전체 → 타점 전개도 전 타점과 같다(별도 분기 불필요하지만,
    // 깔때기 로딩 중 빈 배열로 시트가 통째로 비는 걸 막으려고 전 타점 폴백을 명시한다).
    const points = useMemo<RankPoint[]>(() => {
        if (!funnel.isFiltering) return (pointsQ.data ?? []).map((p) => ({ stockCode: p.stockCode, date: p.date, time: p.time }));
        return funnel.viewedPointRefs;
    }, [funnel.isFiltering, funnel.viewedPointRefs, pointsQ.data]);

    const stageLabels = useMemo(
        () => funnel.active.map((s) => stageLabel(s, funnel.labelLook)),
        [funnel.active, funnel.labelLook],
    );

    // 경로 = raw 분봉(캐시에 없는 날만 배치 조회) → core/market 앵커 정규화. 부분집합 재필터는 서버 왕복 없음.
    const { paths, isLoading: pathsLoading } = useRankPaths(points);
    const dataMaxT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.max(m, p.bars[p.bars.length - 1].t) : m), 0), [paths]);
    const dataMinT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.min(m, p.bars[0].t) : m), 0), [paths]);
    const effHorizon = Math.min(rankHorizon, dataMaxT || rankHorizon);
    const stats = useMemo(() => computePathStats(paths, effHorizon), [paths, effHorizon]);

    return {
        isEmpty: !funnel.isFiltering,
        isLoading: funnel.isLoading || pathsLoading,
        points,
        coverage: funnel.universe,
        paths, stats, effHorizon, dataMinT, dataMaxT, stageLabels, nameOf, metaOf,
    };
}
