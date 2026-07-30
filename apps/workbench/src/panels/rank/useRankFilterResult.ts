// 순위 필터 결과 훅 — 배치 보드가 store 에 건 밴드(rankBands)를 받아 타점 집합·경로·통계를 뽑는다.
// 분석 대시보드(히트맵·시뮬)와 결과 목록 패널이 **같은 결과**를 쓰도록 한 곳에서 도출(드리프트 방지).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { allPointsQuery } from "../../api/queries.js";
import { useRankAxes } from "../../lib/useRankAxes.js";
import { filterPoints, type AxisBand } from "./bandFilter.js";
import { computePathStats, type PathStats } from "./pathStats.js";
import { useRankPaths } from "./useRankPaths.js";
import { pointKey } from "../../lib/pointKey.js";
import { useWorkbench } from "../../store/workbench.js";
import { useTags } from "../../lib/useTags.js";
import { evalTagExpr, isTagExprEmpty } from "./tagFilter.js";
import type { RankPoint } from "../../api/rank.js";
import type { RankPointPath } from "../../api/rankPaths.js";

export interface PointMeta { outcome?: string }

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

export function useRankFilterResult(): RankResult {
    const rankBands = useWorkbench((s) => s.rankBands);
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const tagExpr = useWorkbench((s) => s.tagExpr);
    const rankHorizon = useWorkbench((s) => s.rankHorizon);

    const { axes, linesByAxis } = useRankAxes();
    const { tagIdsOf } = useTags();

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

    // 필터 = 밴드(AND) → 날짜(OR) → 시간(OR) → 태그(DNF) 전부 AND. 밴드 없으면 기반 = 전체 타점(나머지 차원만으로도 필터).
    const bandActive = bands.length > 0;
    const bandResult = useMemo(() => filterPoints(linesByAxis, bands), [linesByAxis, bands]);
    const coverage = bandActive ? bandResult.coverage : (pointsQ.data?.length ?? 0);
    const points = useMemo(() => {
        const base: RankPoint[] = bandActive ? bandResult.points : (pointsQ.data ?? []).map((p) => ({ stockCode: p.stockCode, date: p.date, time: p.time }));
        const dOk = (d: string): boolean => dateRanges.length === 0 || dateRanges.some((r) => d >= r.from && d <= r.to);
        const tOk = (t: string): boolean => { const hm = t.slice(0, 5); return timeRanges.length === 0 || timeRanges.some((r) => hm >= r.from && hm <= r.to); };
        return base.filter((p) => dOk(p.date) && tOk(p.time) && evalTagExpr(tagIdsOf(p), tagExpr));
    }, [bandActive, bandResult, pointsQ.data, dateRanges, timeRanges, tagExpr, tagIdsOf]);
    // 경로 = raw 분봉(캐시에 없는 날만 배치 조회) → core/market 앵커 정규화. 부분집합 재필터는 서버 왕복 없음.
    const { paths, isLoading: pathsLoading } = useRankPaths(points);

    const dataMaxT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.max(m, p.bars[p.bars.length - 1].t) : m), 0), [paths]);
    const dataMinT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.min(m, p.bars[0].t) : m), 0), [paths]);
    const effHorizon = Math.min(rankHorizon, dataMaxT || rankHorizon);
    const stats = useMemo(() => computePathStats(paths, effHorizon), [paths, effHorizon]);

    return {
        isEmpty: bands.length === 0 && dateRanges.length === 0 && timeRanges.length === 0 && isTagExprEmpty(tagExpr),
        isLoading: pathsLoading,
        points, coverage, paths, stats, effHorizon, dataMinT, dataMaxT, activeAxisNames, nameOf, metaOf,
    };
}
