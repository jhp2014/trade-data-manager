// 차트 앵커 편집 훅 — **param 하나 = 훅 하나**(선·무시 캔들·일봉 골격·분봉 골격).
//
// 옛 useChartAnchorsForChart 는 세 관심사를 한 훅이 12멤버로 반환했고, param 이 늘 때마다 훅·반환 타입·
// 패널 배선이 같이 자랐다(분봉 골격 때 실제로 그랬다). 쪼개도 **왕복은 늘지 않는다** — 네 훅이 같은
// 쿼리 키(chartAnchorsQuery)를 쓰므로 React Query 가 dedup 한다. 새 param = 여기 훅 하나.
//
// 공유 내부(useAnchorMutations): 추가/삭제 mutation 과 invalidate 집합(anchors·작업셋·계산 축)은 param 이
// 달라도 동일하다 — 앵커는 전부 계산 축의 입력이라, 어떤 편집이든 축 값이 즉시 따라와야 한다(서버는
// 지문으로 그 차트/타점만 다시 굽는다).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { BASELINE_PARAM, candlePrice, IGNORE_CANDLE_PARAM, SKELETON_MINUTE_PARAM, SKELETON_PARAM, sortPivots, syntheticClosePivots, type SkeletonPivot } from "@trade-data-manager/market/domain";
import { addChartAnchor, removeChartAnchor, type AddChartAnchorInput, type AnchorField, type AnchorMarket, type ChartAnchor } from "../api/chartAnchors.js";
import { chartAnchorsQuery, anchoredChartsQuery, computedAxesQuery, skeletonsQuery, reviewPointsQuery } from "../api/queries.js";
import { kstToUnix } from "./derive.js";
import { resolveChartAnchorLines, type RenderLine } from "./chartFrame.js";
import type { ChartBundle } from "../api/chart.js";

/** 이 캔들에 찍힌 골격 점 — 값 + 저장된 시장(메뉴 배지). 일봉·분봉 골격이 같은 모양(B12 명명 통일). */
export interface PivotAtCandle {
    field: AnchorField;
    market: AnchorMarket;
}

interface AnchorMutations {
    add: UseMutationResult<ChartAnchor, Error, AddChartAnchorInput>;
    remove: UseMutationResult<void, Error, string>;
    removeMany: (ids: readonly string[]) => void;
}

/** 이 차트의 앵커 전부 + 공유 mutation. 각 param 훅이 여기서 걸러 쓴다(쿼리 키 하나 = RQ dedup). */
function useChartAnchors(code: string, date: string): { anchors: ChartAnchor[]; mut: AnchorMutations } {
    const qc = useQueryClient();
    const anchorsQ = useQuery(chartAnchorsQuery(code, date));
    const anchors = useMemo(() => anchorsQ.data ?? [], [anchorsQ.data]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: chartAnchorsQuery(code, date).queryKey });
        void qc.invalidateQueries({ queryKey: anchoredChartsQuery().queryKey }); // 작업셋 패널 즉시 반영
        void qc.invalidateQueries({ queryKey: computedAxesQuery().queryKey }); // 앵커는 축 입력 — 즉시 재굽기
        void qc.invalidateQueries({ queryKey: skeletonsQuery().queryKey }); // 골격 좌표(겹쳐 그리기)도 같은 입력
    };
    const add = useMutation({ mutationFn: addChartAnchor, onSuccess: invalidate });
    const remove = useMutation({ mutationFn: removeChartAnchor, onSuccess: invalidate });
    const removeManyMut = useMutation({
        // allSettled + onSettled — 부분 실패면 일부는 이미 서버에서 지워졌다. 전 요청이 끝난 뒤(앞질러 재조회하면
        // 비행 중인 삭제가 stale 을 만든다) 성패 무관하게 invalidate 해야 화면이 서버 진실로 수렴한다.
        mutationFn: async (ids: readonly string[]) => {
            const results = await Promise.allSettled(ids.map((id) => removeChartAnchor(id)));
            const failed = results.filter((r) => r.status === "rejected").length;
            if (failed > 0) throw new Error(`앵커 ${failed}/${ids.length}건 삭제 실패`);
        },
        onSettled: invalidate,
    });
    return { anchors, mut: { add, remove, removeMany: (ids) => removeManyMut.mutate(ids) } };
}

// ── 선(기준선 후보) ─────────────────────────────────────────────────────────
export interface BaselineLines {
    resolvedLines: RenderLine[]; // D+M 해소된 선(분봉용). 확정 기준선(가격 최저)은 하늘색.
    dLines: RenderLine[]; // 일봉용(D만)
    hasLines: boolean;
    /** 이 캔들에 선 추가 — field·market 은 메뉴가 고른다. 분봉은 market 'un' 고정(서버 규칙). */
    addLine: (anchorDate: string, anchorTime: string | undefined, field: AnchorField, market: AnchorMarket) => void;
    /** 이 캔들에 이미 그어진 선의 id(메뉴의 "이 봉의 선 삭제"). 없으면 undefined. */
    lineIdAt: (anchorDate: string, anchorTime: string | undefined) => string | undefined;
    removeLineById: (id: string) => void;
    clear: () => void;
}

/** 선 = param 'baseline'(옛 가격선 흡수·차트 소유). 해소는 raw 번들의 저장 시장·값 — 모드 토글 무관. */
export function useBaselineLines(code: string, date: string, dailyBundle: ChartBundle | undefined, minuteBundle: ChartBundle | undefined): BaselineLines {
    const { anchors, mut } = useChartAnchors(code, date);
    const lines = useMemo(() => anchors.filter((a) => a.param === BASELINE_PARAM), [anchors]);
    const resolvedLines = useMemo(() => resolveChartAnchorLines(lines, dailyBundle, minuteBundle), [lines, dailyBundle, minuteBundle]);
    const dLines = useMemo(() => resolvedLines.filter((l) => l.kind === "D"), [resolvedLines]);
    return {
        resolvedLines,
        dLines,
        hasLines: lines.length > 0,
        addLine: (anchorDate, anchorTime, field, market) => {
            if (code && date) mut.add.mutate({ stockCode: code, date, param: BASELINE_PARAM, anchorDate, anchorTime, field, market });
        },
        lineIdAt: (anchorDate, anchorTime) => lines.find((l) => l.anchorDate === anchorDate && (l.anchorTime ?? undefined) === anchorTime)?.id,
        removeLineById: (id) => mut.remove.mutate(id),
        // clear — 선만(무시 캔들·골격·저장 타점은 건드리지 않음). 우클릭이 잘 안 잡히는 경우 대비.
        clear: () => mut.removeMany(lines.map((l) => l.id)),
    };
}

// ── 무시 캔들 ───────────────────────────────────────────────────────────────
export interface IgnoreCandles {
    /** 무시 캔들 날짜들(차트 소유 — 타점 무관 상시 표시). */
    ignoredDates: string[];
    /** 이 일봉의 토글 — 있으면 해제, 없으면 지정. */
    toggleIgnore: (anchorDate: string) => void;
}

export function useIgnoreCandles(code: string, date: string): IgnoreCandles {
    const { anchors, mut } = useChartAnchors(code, date);
    const ignores = useMemo(() => anchors.filter((a) => a.param === IGNORE_CANDLE_PARAM), [anchors]);
    return {
        ignoredDates: useMemo(() => ignores.map((a) => a.anchorDate), [ignores]),
        toggleIgnore: (anchorDate) => {
            const existing = ignores.find((a) => a.anchorDate === anchorDate);
            if (existing) mut.remove.mutate(existing.id);
            else mut.add.mutate({ stockCode: code, date, param: IGNORE_CANDLE_PARAM, anchorDate });
        },
    };
}

// ── 골격(일봉·분봉) — 반환 모양이 같다(points·pivotsAt·toggle·clear·hasAny). ──
export interface SkeletonEditor<P> {
    /** 오버레이용 피벗 — 시간순 정렬(도메인 sortPivots — 서버 형태 계산과 같은 규칙)에 가격을 붙인 것. */
    points: P[];
    /** 이 캔들에 찍힌 값들(메뉴 토글 상태 + 저장된 시장 배지). */
    pivotsAt: (coord: string) => PivotAtCandle[];
    /** 이 캔들의 점 토글. 집합 규칙 위반(상한·같은 캔들 高低)은 서버가 400 으로 막는다. */
    toggle: (coord: string, field: AnchorField, market: AnchorMarket) => void;
    /** 이 골격 전체 삭제(다시 찍기). */
    clear: () => void;
    hasAny: boolean;
}

/**
 * 일봉 골격(차트 소유) — coord = anchorDate.
 * 같은 캔들·같은 값은 시장이 달라도 **한 점**이다(정렬 위치가 같아 순서가 모호해지므로 서버도 막는다).
 * 그래서 해제 판정에 market 을 안 본다 — KRX 로 보는 중에 UN 점을 눌러도 그 점이 꺼진다(눈에 보이는 대로).
 */
export function useDailySkeleton(code: string, date: string, dailyBundle: ChartBundle | undefined): SkeletonEditor<{ date: string; price: number }> {
    const { anchors, mut } = useChartAnchors(code, date);
    const mine = useMemo(() => anchors.filter((a) => a.param === SKELETON_PARAM && a.field != null && a.market != null), [anchors]);
    const points = useMemo(() => {
        const sorted = sortPivots(mine.map((a) => ({ anchorDate: a.anchorDate, anchorTime: a.anchorTime, field: a.field!, market: a.market! })));
        const out: { date: string; price: number }[] = [];
        for (const p of sorted) {
            if (p.anchorTime) continue; // 일봉 골격 — 분봉 좌표는 스키마상 없지만 방어적으로
            const price = candlePrice(dailyBundle?.daily.find((c) => c.date === p.anchorDate)?.[p.market]?.[p.field]);
            if (price !== null) out.push({ date: p.anchorDate, price }); // 창 밖 피벗은 빠진다(선이 조금 짧아질 뿐)
        }
        return out;
    }, [mine, dailyBundle]);
    return {
        points,
        pivotsAt: (anchorDate) => mine.filter((a) => a.anchorDate === anchorDate && a.anchorTime == null).map((a) => ({ field: a.field!, market: a.market! })),
        toggle: (anchorDate, field, market) => {
            if (!code || !date) return;
            const existing = mine.find((a) => a.anchorDate === anchorDate && a.anchorTime == null && a.field === field);
            if (existing) mut.remove.mutate(existing.id);
            else mut.add.mutate({ stockCode: code, date, param: SKELETON_PARAM, anchorDate, field, market });
        },
        clear: () => mut.removeMany(mine.map((a) => a.id)),
        hasAny: mine.length > 0,
    };
}

/**
 * 분봉 골격(차트 소유·당일 장중 경로) — coord = anchorTime. 일봉 골격과 같은 소유라 activeTime 이 없어도
 * 편집된다(타점별 상한은 읽기 절단 — resolveMinuteSkeletons — 의 몫이지 쓰기의 몫이 아니다).
 * 시장은 언제나 UN(분봉 앵커 규칙)이라 toggle 의 market 인자는 무시된다.
 *
 * **표시 경로에는 타점 종가를 합성한다**("타점 종가 = 골격의 한 점" — 서버 리졸버와 같은 규칙):
 * 손 피벗이 하나라도 있을 때, 손 피벗 없는 캔들의 저장 타점 종가를 경로에 병합한다. 편집(mine·토글)은
 * 손 피벗만 — 합성점은 지울 대상이 아니다(타점을 지우면 사라진다).
 */
export function useMinuteSkeleton(code: string, date: string, minuteBundle: ChartBundle | undefined): SkeletonEditor<{ time: number; price: number }> {
    const { anchors, mut } = useChartAnchors(code, date);
    const reviewQ = useQuery(reviewPointsQuery(code, date)); // useReviewPointData 와 같은 키 — RQ dedup
    const mine = useMemo(
        () => anchors.filter((a) => a.param === SKELETON_MINUTE_PARAM && a.time == null && a.field != null && a.anchorTime != null),
        [anchors],
    );
    const points = useMemo(() => {
        const pivots: SkeletonPivot[] = mine.map((a) => ({ anchorDate: a.anchorDate, anchorTime: a.anchorTime!, field: a.field!, market: a.market! as AnchorMarket }));
        // 합성 규칙은 도메인 단일 출처(서버 리졸버와 같은 함수) — 편집 중 오버레이와 겹쳐 그리기가 같은 경로를 그린다.
        pivots.push(...syntheticClosePivots(date, new Set(mine.map((a) => a.anchorTime!)), (reviewQ.data ?? []).map((rp) => rp.time)));
        const out: { time: number; price: number }[] = [];
        for (const p of sortPivots(pivots)) {
            const price = candlePrice(minuteBundle?.minutes.find((c) => c.date === p.anchorDate && c.time === p.anchorTime)?.un?.[p.field]);
            if (price !== null) out.push({ time: kstToUnix(p.anchorDate, p.anchorTime!), price });
        }
        return out;
    }, [mine, reviewQ.data, date, minuteBundle]);
    return {
        points,
        pivotsAt: (anchorTime) => mine.filter((a) => a.anchorTime === anchorTime).map((a) => ({ field: a.field!, market: a.market! })),
        toggle: (anchorTime, field) => {
            if (!code || !date) return;
            const existing = mine.find((a) => a.anchorTime === anchorTime && a.field === field);
            if (existing) mut.remove.mutate(existing.id);
            else mut.add.mutate({ stockCode: code, date, param: SKELETON_MINUTE_PARAM, anchorDate: date, anchorTime, field, market: "un" });
        },
        clear: () => mut.removeMany(mine.map((a) => a.id)),
        hasAny: mine.length > 0,
    };
}
