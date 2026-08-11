// 순위 필터 결과 훅 — 배치 보드가 store 에 건 밴드(rankBands)를 받아 타점 집합·경로·통계를 뽑는다.
// 분석 대시보드(히트맵·시뮬)와 결과 목록 패널이 **같은 결과**를 쓰도록 한 곳에서 도출(드리프트 방지).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { allPointsQuery } from "../../api/queries.js";
import { useRankAxes } from "../../lib/useRankAxes.js";
import { filterPoints, type AxisBand } from "./bandFilter.js";
import { activeValueAxisIds, makeAxisValuePredicate } from "./axisValueFilter.js";
import { computePathStats, type PathStats } from "./pathStats.js";
import { useRankPaths } from "./useRankPaths.js";
import { pointKey } from "../../lib/pointKey.js";
import { useWorkbench } from "../../store/workbench.js";
import { useGroups } from "../../lib/useGroups.js";
import { evalGroupExpr, isGroupExprEmpty } from "./groupFilter.js";
import type { RankPoint } from "../../api/rank.js";
import type { RankPointPath } from "../../api/rankPaths.js";

export interface PointMeta { outcome?: string }

export interface RankResult {
    isEmpty: boolean; // 활성 밴드 없음
    /**
     * **타점에서만** 판정 가능한 차원(밴드·계산축 값구간·시간대)이 활성인가 — 차트 단위 소비자(골격 일봉
     * 패널)가 "매칭 타점을 가진 차트" 우회를 탈지 가르는 기준. 날짜·그룹는 차트에서도 판정 가능해 안 든다.
     * 어느 차원이 어느 부류인지는 필터의 지식이라 여기서 낸다 — 소비자가 store 를 직접 열람하면
     * 차원이 늘 때 한쪽만 고쳐지고, 슬롯이 안 풀리는 스테일 밴드를 활성으로 오판한다(여긴 해소 후 판정).
     */
    pointOnlyActive: boolean;
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
    const axisValueRanges = useWorkbench((s) => s.axisValueRanges);
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const groupExpr = useWorkbench((s) => s.groupExpr);
    const rankHorizon = useWorkbench((s) => s.rankHorizon);

    // 계산 축까지 — 값 구간 필터가 판단 축 밴드와 같은 파이프라인에 들어간다.
    // (밴드는 계산 축에 안 걸린다: 계산 축 경계는 slot 앵커가 아니라 값/타점 앵커라 axisValueRanges 쪽이다.)
    const { axes, linesByAxis, computedValues } = useRankAxes({ includeComputed: true });
    const { groupIdsOf } = useGroups();

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
    const valueAxisIds = useMemo(() => new Set(activeValueAxisIds(axisValueRanges, computedValues)), [axisValueRanges, computedValues]);
    const valueOk = useMemo(() => makeAxisValuePredicate(axisValueRanges, computedValues), [axisValueRanges, computedValues]);
    const activeAxisNames = useMemo(
        () => axes.filter((ax) => bands.some((b) => b.axisId === ax.id) || valueAxisIds.has(ax.id)).map((ax) => ax.name),
        [axes, bands, valueAxisIds],
    );

    // 필터 = 밴드(AND) → 계산 축 값구간(축AND·구간OR) → 날짜(OR) → 시간(OR) → 그룹(DNF) 전부 AND.
    // 밴드 없으면 기반 = 전체 타점(나머지 차원만으로도 필터).
    const bandActive = bands.length > 0;
    const bandResult = useMemo(() => filterPoints(linesByAxis, bands), [linesByAxis, bands]);
    const coverage = bandActive ? bandResult.coverage : (pointsQ.data?.length ?? 0);
    const points = useMemo(() => {
        const base: RankPoint[] = bandActive ? bandResult.points : (pointsQ.data ?? []).map((p) => ({ stockCode: p.stockCode, date: p.date, time: p.time }));
        const dOk = (d: string): boolean => dateRanges.length === 0 || dateRanges.some((r) => d >= r.from && d <= r.to);
        const tOk = (t: string): boolean => { const hm = t.slice(0, 5); return timeRanges.length === 0 || timeRanges.some((r) => hm >= r.from && hm <= r.to); };
        return base.filter((p) => valueOk(pointKey(p)) && dOk(p.date) && tOk(p.time) && evalGroupExpr(groupIdsOf(p), groupExpr));
    }, [bandActive, bandResult, pointsQ.data, valueOk, dateRanges, timeRanges, groupExpr, groupIdsOf]);
    // 경로 = raw 분봉(캐시에 없는 날만 배치 조회) → core/market 앵커 정규화. 부분집합 재필터는 서버 왕복 없음.
    const { paths, isLoading: pathsLoading } = useRankPaths(points);

    const dataMaxT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.max(m, p.bars[p.bars.length - 1].t) : m), 0), [paths]);
    const dataMinT = useMemo(() => paths.reduce((m, p) => (p.bars.length ? Math.min(m, p.bars[0].t) : m), 0), [paths]);
    const effHorizon = Math.min(rankHorizon, dataMaxT || rankHorizon);
    const stats = useMemo(() => computePathStats(paths, effHorizon), [paths, effHorizon]);

    return {
        isEmpty: bands.length === 0 && valueAxisIds.size === 0 && dateRanges.length === 0 && timeRanges.length === 0 && isGroupExprEmpty(groupExpr),
        pointOnlyActive: bands.length > 0 || valueAxisIds.size > 0 || timeRanges.length > 0,
        isLoading: pathsLoading,
        points, coverage, paths, stats, effHorizon, dataMinT, dataMaxT, activeAxisNames, nameOf, metaOf,
    };
}
