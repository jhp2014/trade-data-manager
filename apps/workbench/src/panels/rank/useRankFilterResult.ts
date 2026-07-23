// 순위 필터 결과 훅 — 배치 보드가 store 에 건 밴드(rankBands)를 받아 타점 집합·경로·통계를 뽑는다.
// 분석 대시보드(히트맵·시뮬)와 결과 목록 패널이 **같은 결과**를 쓰도록 한 곳에서 도출(드리프트 방지).
import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { rankAxesQuery, axisLineQuery, allPointsQuery, rankPathsQuery } from "../../api/queries.js";
import { filterPoints, type AxisBand } from "./bandFilter.js";
import { computePathStats, type PathStats } from "./pathStats.js";
import { useWorkbench } from "../../store/workbench.js";
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { RankPoint } from "../../api/rank.js";
import type { RankPointPath } from "../../api/rankPaths.js";

export interface PointMeta { outcome?: string; type?: string }

export interface RankResult {
    isEmpty: boolean; // 활성 밴드 없음
    isLoading: boolean;
    points: RankPoint[];
    coverage: number;
    paths: RankPointPath[];
    stats: PathStats;
    effHorizon: number;
    dataMinT: number; // 최소 t(진입 전 = 음수)
    dataMaxT: number;
    activeAxisNames: string[];
    nameOf: (code: string) => string;
    metaOf: (key: string) => PointMeta;
}

const key = (p: { stockCode: string; date: string; time: string }): string => `${p.stockCode}|${p.date}|${p.time}`;

export function useRankFilterResult(): RankResult {
    const rankBands = useWorkbench((s) => s.rankBands);
    const rankHorizon = useWorkbench((s) => s.rankHorizon);

    const axesQ = useQuery(rankAxesQuery());
    const axes = useMemo(() => axesQ.data ?? [], [axesQ.data]);
    const lineQs = useQueries({ queries: axes.map((a) => axisLineQuery(a.id)) });
    const linesByAxis = useMemo(() => {
        const m = new Map<string, PlacedPoint[]>();
        axes.forEach((a, i) => m.set(a.id, lineQs[i]?.data ?? []));
        return m;
    }, [axes, lineQs]);

    const pointsQ = useQuery(allPointsQuery());
    const nameOf = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        return (code: string): string => m.get(code) ?? code;
    }, [pointsQ.data]);
    const metaOf = useMemo(() => {
        const m = new Map<string, PointMeta>();
        for (const p of pointsQ.data ?? []) m.set(key(p), { outcome: p.outcome, type: p.type });
        return (k: string): PointMeta => m.get(k) ?? {};
    }, [pointsQ.data]);

    // store 밴드(슬롯 앵커) → orderKey 구간. 한쪽만이면 반열림(±Infinity).
    const bands: AxisBand[] = useMemo(
        () =>
            axes.flatMap((ax) => {
                const b = rankBands[ax.id];
                if (!b || (!b.lo && !b.hi)) return [];
                const line = linesByAxis.get(ax.id) ?? [];
                const okOf = (slotId?: string): number | undefined => (slotId ? line.find((pp) => pp.slotId === slotId)?.orderKey : undefined);
                const loK = okOf(b.lo);
                const hiK = okOf(b.hi);
                let from = -Infinity;
                let to = Infinity;
                if (loK != null && hiK != null) { from = Math.min(loK, hiK); to = Math.max(loK, hiK); }
                else if (loK != null) from = loK;
                else if (hiK != null) to = hiK;
                else return [];
                return [{ axisId: ax.id, from, to }];
            }),
        [axes, rankBands, linesByAxis],
    );
    const activeAxisNames = useMemo(() => axes.filter((ax) => bands.some((b) => b.axisId === ax.id)).map((ax) => ax.name), [axes, bands]);

    const { points, coverage } = useMemo(() => filterPoints(linesByAxis, bands), [linesByAxis, bands]);
    const pathsQ = useQuery(rankPathsQuery(points));
    const paths = useMemo(() => pathsQ.data ?? [], [pathsQ.data]);

    const dataMaxT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.max(m, p.bars[p.bars.length - 1].t) : m), 0), [paths]);
    const dataMinT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.min(m, p.bars[0].t) : m), 0), [paths]);
    const effHorizon = Math.min(rankHorizon, dataMaxT || rankHorizon);
    const stats = useMemo(() => computePathStats(paths, effHorizon), [paths, effHorizon]);

    return {
        isEmpty: bands.length === 0,
        isLoading: pathsQ.isLoading,
        points, coverage, paths, stats, effHorizon, dataMinT, dataMaxT, activeAxisNames, nameOf, metaOf,
    };
}
