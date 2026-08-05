// ChartPanel 편집 유스케이스 훅 — 차트 앵커(선·무시 캔들)/타점의 조회·해소·mutation·단축키를 컴포넌트에서 분리.
// 패널은 뷰 파생(deriveMinute/DailyView)+렌더만 남긴다.
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BASELINE_PARAM, candlePrice, IGNORE_CANDLE_PARAM, SKELETON_MINUTE_PARAM, SKELETON_PARAM, sortPivots } from "@trade-data-manager/market/domain";
import { addChartAnchor, removeChartAnchor, type AnchorField, type AnchorMarket, type RenderLine } from "../api/chartAnchors.js";
import { upsertReviewPoint, removeReviewPoint, type ReviewPoint } from "../api/reviewPoints.js";
import { useTags } from "./useTags.js";
import { presetToggle } from "./tagIndex.js";
import { chartAnchorsQuery, anchoredChartsQuery, reviewPointsQuery, allPointsQuery, chartQuery, computedAxesQuery } from "../api/queries.js";
import { kstToUnix, deriveMinuteView } from "./derive.js";
import { resolveChartAnchorLines } from "./chartFrame.js";
import { usePlacements } from "./usePlacements.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { useWorkbench } from "../store/workbench.js";
import type { ChartBundle } from "../api/chart.js";
import type { Command } from "../keymap/types.js";

export interface ChartAnchorsForChart {
    resolvedLines: RenderLine[]; // D+M 해소된 선(분봉용). 확정 기준선(가격 최저)은 하늘색.
    dLines: RenderLine[]; // 일봉용(D만)
    hasLines: boolean;
    /** 이 캔들에 선(=기준선 후보) 추가 — field·market 은 메뉴가 고른다. 분봉은 market 'un' 고정(서버 규칙). */
    addLine: (anchorDate: string, anchorTime: string | undefined, field: AnchorField, market: AnchorMarket) => void;
    /** 이 캔들에 이미 그어진 선의 id(메뉴의 "이 봉의 선 삭제"). 없으면 undefined. */
    lineIdAt: (anchorDate: string, anchorTime: string | undefined) => string | undefined;
    removeLineById: (id: string) => void;
    clear: () => void;
    /** 무시 캔들 날짜들(차트 소유 — 타점 무관 상시 표시). */
    ignoredDates: string[];
    /** 이 일봉의 무시 캔들 토글 — 있으면 해제, 없으면 지정. */
    toggleIgnore: (anchorDate: string) => void;
    /** 골격 피벗 — 시간순 정렬(도메인 규칙)에 로드된 캔들 가격을 붙인 것. 오버레이가 이대로 잇는다. */
    skeletonPoints: { date: string; price: number }[];
    /** 이 캔들의 골격 점 토글 — 같은 (캔들, 값)이 있으면 해제, 없으면 추가. 집합 규칙 위반은 서버가 400. */
    toggleSkeletonPivot: (anchorDate: string, field: AnchorField, market: AnchorMarket) => void;
    /** 이 캔들에 찍힌 골격 점들 — 값 + **저장된 시장**(메뉴가 지금 보는 시장과 다르면 그쪽을 적는다). */
    skeletonAt: (anchorDate: string) => { field: AnchorField; market: AnchorMarket }[];
    /** 이 차트의 골격 전체 삭제(다시 찍기). */
    clearSkeleton: () => void;
}

/**
 * 차트 앵커 — 조회 + 해소(raw 번들에서 저장된 시장·값) + 메뉴용 추가/삭제/clear/무시 토글.
 * 선 = param 'baseline' 앵커(옛 가격선 흡수), 소유는 차트(종목,날짜)라 타점 선택이 필요 없다.
 * ⚠ 선이 곧 계산 축의 기준선 후보라서 모든 mutation 이 computedAxes 를 invalidate 한다(서버는 지문으로
 * 그 차트 타점들만 다시 굽는다).
 */
export function useChartAnchorsForChart(
    code: string,
    date: string,
    dailyBundle: ChartBundle | undefined,
    minuteBundle: ChartBundle | undefined,
): ChartAnchorsForChart {
    const qc = useQueryClient();
    const anchorsQ = useQuery(chartAnchorsQuery(code, date));
    const anchors = useMemo(() => anchorsQ.data ?? [], [anchorsQ.data]);
    const lines = useMemo(() => anchors.filter((a) => a.param === BASELINE_PARAM), [anchors]);
    const ignores = useMemo(() => anchors.filter((a) => a.param === IGNORE_CANDLE_PARAM), [anchors]);
    const skeleton = useMemo(() => anchors.filter((a) => a.param === SKELETON_PARAM && a.field != null && a.market != null), [anchors]);

    // 저장된 시장·값을 raw 번들에서 해소(모드 토글 무관 — 사람이 지목한 그 값). 확정 기준선은 하늘색 표시.
    const resolvedLines = useMemo(() => resolveChartAnchorLines(lines, dailyBundle, minuteBundle), [lines, dailyBundle, minuteBundle]);
    const dLines = useMemo(() => resolvedLines.filter((l) => l.kind === "D"), [resolvedLines]);
    const ignoredDates = useMemo(() => ignores.map((a) => a.anchorDate), [ignores]);

    // 골격 — **정렬은 도메인 함수 하나**(sortPivots)를 서버와 공유한다. 클라가 따로 정렬 규칙을 적으면
    // 화면의 선 모양과 서버가 계산한 형태가 조용히 갈린다(순서가 곧 의미인 데이터라 치명적).
    // 가격은 로드된 일봉에서 저장된 시장·값으로 해소 — 창 밖 피벗은 그냥 빠진다(선이 조금 짧아질 뿐).
    const skeletonPoints = useMemo(() => {
        const sorted = sortPivots(skeleton.map((a) => ({ anchorDate: a.anchorDate, anchorTime: a.anchorTime, field: a.field!, market: a.market! })));
        const out: { date: string; price: number }[] = [];
        for (const p of sorted) {
            if (p.anchorTime) continue; // 일봉 차트 오버레이 — 분봉 골격은 분봉 pane 몫(후속)
            const price = candlePrice(dailyBundle?.daily.find((c) => c.date === p.anchorDate)?.[p.market]?.[p.field]);
            if (price !== null) out.push({ date: p.anchorDate, price }); // 값 해석(미수집/0/비수치=결손)은 도메인 규칙
        }
        return out;
    }, [skeleton, dailyBundle]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: chartAnchorsQuery(code, date).queryKey });
        void qc.invalidateQueries({ queryKey: anchoredChartsQuery().queryKey }); // 작업셋 패널 즉시 반영
        // 선·무시 캔들은 계산 축의 입력 — 긋고 지우는 즉시 축 값이 따라와야 한다(지문이 그 차트만 재굽기).
        void qc.invalidateQueries({ queryKey: computedAxesQuery().queryKey });
    };
    const addMut = useMutation({ mutationFn: addChartAnchor, onSuccess: invalidate });
    const removeMut = useMutation({ mutationFn: removeChartAnchor, onSuccess: invalidate });
    // clear — 이 차트의 선 전체 삭제(우클릭이 잘 안 잡히는 경우 대비). 무시 캔들·저장 타점은 건드리지 않음.
    const clearMut = useMutation({
        mutationFn: async () => {
            await Promise.all(lines.map((l) => removeChartAnchor(l.id)));
        },
        onSuccess: invalidate,
    });

    const addLine = (anchorDate: string, anchorTime: string | undefined, field: AnchorField, market: AnchorMarket): void => {
        if (!code || !date) return;
        addMut.mutate({ stockCode: code, date, param: BASELINE_PARAM, anchorDate, anchorTime, field, market });
    };
    const lineIdAt = (anchorDate: string, anchorTime: string | undefined): string | undefined =>
        lines.find((l) => l.anchorDate === anchorDate && (l.anchorTime ?? undefined) === anchorTime)?.id;
    const removeLineById = (id: string): void => removeMut.mutate(id);
    const clear = (): void => clearMut.mutate();
    const toggleIgnore = (anchorDate: string): void => {
        const existing = ignores.find((a) => a.anchorDate === anchorDate);
        if (existing) removeMut.mutate(existing.id);
        else addMut.mutate({ stockCode: code, date, param: IGNORE_CANDLE_PARAM, anchorDate });
    };
    // 같은 캔들·같은 값은 시장이 달라도 **한 점**이다(정렬 위치가 같아 순서가 모호해지므로 서버도 막는다).
    // 그래서 해제 판정에 market 을 안 본다 — KRX 로 보는 중에 UN 점을 눌러도 그 점이 꺼진다(눈에 보이는 대로).
    const toggleSkeletonPivot = (anchorDate: string, field: AnchorField, market: AnchorMarket): void => {
        if (!code || !date) return;
        const existing = skeleton.find((a) => a.anchorDate === anchorDate && a.anchorTime == null && a.field === field);
        if (existing) removeMut.mutate(existing.id);
        else addMut.mutate({ stockCode: code, date, param: SKELETON_PARAM, anchorDate, field, market });
    };
    const skeletonAt = (anchorDate: string): { field: AnchorField; market: AnchorMarket }[] =>
        skeleton.filter((a) => a.anchorDate === anchorDate && a.anchorTime == null).map((a) => ({ field: a.field!, market: a.market! }));
    const clearSkeletonMut = useMutation({
        mutationFn: async () => {
            await Promise.all(skeleton.map((a) => removeChartAnchor(a.id)));
        },
        onSuccess: invalidate,
    });
    const clearSkeleton = (): void => clearSkeletonMut.mutate();

    return {
        resolvedLines, dLines, hasLines: lines.length > 0, addLine, lineIdAt, removeLineById, clear,
        ignoredDates, toggleIgnore,
        skeletonPoints, toggleSkeletonPivot, skeletonAt, clearSkeleton,
    };
}

export interface SavedPoint {
    time: number; // 저장 타점 시각(unix초) — 분봉 세로선/아이콘
    placed: number; // 이 타점이 배치된 축 수(▼ 채움·배지). 축별 상세는 "타점 정보" 패널.
}

export interface ChartReviewPoints {
    savedPoints: SavedPoint[];
    focusedPoint: ReviewPoint | undefined; // 현재 Focus.time 에 저장된 타점(헤더 배지)
    axisTotal: number; // 순위 축 총수(배지 분모)
}

/**
 * 복기 타점 조회 데이터(차트 렌더용) — 저장타점 세로선·hover 카드·현재타점 배지. 단축키 등록은 전역 useChartHotkeys 로 이관.
 * 배치 개수는 여기서 함께 붙인다 — 차트는 스냅된 봉 시각만 들고 다녀서(원래 HH:MM:SS 를 잃는다) 나중에 못 붙인다.
 */
export function useReviewPointData(code: string, date: string, time: string | null): ChartReviewPoints {
    const reviewQ = useQuery(reviewPointsQuery(code, date));
    const reviewPoints = useMemo(() => reviewQ.data ?? [], [reviewQ.data]);
    const placements = usePlacements();

    const savedPoints = useMemo<SavedPoint[]>(() => {
        if (!date) return [];
        return reviewPoints.map((rp) => {
            const ref = { stockCode: code, date, time: rp.time };
            return { time: kstToUnix(date, rp.time), placed: placements.countOf(ref) };
        });
    }, [reviewPoints, code, date, placements]);

    const focusedPoint = useMemo(() => reviewPoints.find((rp) => rp.time === time), [reviewPoints, time]);
    return { savedPoints, focusedPoint, axisTotal: placements.axisTotal };
}

/**
 * 차트 단축키 — **전역 1회 등록**(App). 패널별 등록이 아니라 focus 를 따라간다 → 차트 여러 개여도 커맨드 충돌 없고,
 * 패널 마운트/포커스 상태에 안 흔들린다(옛 패널별 등록의 "가끔 안 먹음" 버그 해결). 입력창 포커스 중 mod-less 는 디스패처가 가드.
 *   space=타점 저장/삭제 · 1~4=태그 프리셋(조합) 탈부착 · a/d=±1분봉 · shift+a/d=±jumpBars(setTime, activePoint 유지)
 *   ctrl+a/d=타점 순회 wrap(goToPoint) · f=일봉+분봉 확대/축소(store chartZoom, 두 차트 동시).
 * **타점 입력(space)과 태그 입력(1~4)은 분리** — 숫자키는 이미 있는 타점에만 작동한다(없으면 무시).
 * 태그는 붙였다 떼는 토글이고 슬롯이 **집합**이라, 프리셋 태그가 전부 붙어 있을 때만 전부 떨어진다
 * (일부만 붙어 있으면 나머지를 채운다 — 판정 규칙은 순수 presetToggle).
 * 핸들러는 매 렌더 최신 클로저로 h.current 갱신(안정 ref), 등록 effect 는 프리셋 변화에만 재실행.
 */
export function useChartHotkeys(): void {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.search?.date ?? s.focus.date); // 검색날짜(드리프트) 우선 — 차트 분봉이 보는 날짜와 일치(타점/이동봉이 그 날짜에 작동)
    const time = useWorkbench((s) => s.focus.time);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const jumpBars = useWorkbench((s) => s.chartSettings.jumpBars);
    const tagPresets = useWorkbench((s) => s.tagPresets);
    const { tagById, tagIdsOf, applyTags } = useTags();
    const qc = useQueryClient();

    const chartQ = useQuery(chartQuery(code, date)); // ChartPanel 과 같은 키 → RQ 캐시 공유(중복 페치 0)
    const minutePoints = useMemo(() => (chartQ.data ? deriveMinuteView(chartQ.data, mode).points : []), [chartQ.data, mode]);
    const reviewQ = useQuery(reviewPointsQuery(code, date));
    const reviewPoints = useMemo(() => reviewQ.data ?? [], [reviewQ.data]);
    const reviewTimes = useMemo(() => [...reviewPoints.map((rp) => rp.time)].sort(), [reviewPoints]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: reviewPointsQuery(code, date).queryKey });
        void qc.invalidateQueries({ queryKey: allPointsQuery().queryKey });
        // 계산 축은 타점 집합에서 나온다 — 타점이 늘거나 줄면 다시 굽는다(서버가 증분이라 새 타점만 계산).
        void qc.invalidateQueries({ queryKey: computedAxesQuery().queryKey });
    };
    const upsertMut = useMutation({ mutationFn: upsertReviewPoint, onSuccess: invalidate });
    const removeMut = useMutation({ mutationFn: (v: { code: string; date: string; time: string }) => removeReviewPoint(v.code, v.date, v.time), onSuccess: invalidate });

    // 매 렌더 최신 클로저로 핸들러 갱신(안정 ref 유지) → 등록된 run 은 항상 최신 상태를 본다.
    const h = useRef({ toggle: () => {}, applyTag: (_: number) => {}, moveBar: (_: number) => {}, jump: (_: number) => {}, navPoint: (_: number) => {} });
    h.current.toggle = () => {
        if (!code || !date || !time) return;
        const existing = reviewPoints.find((rp) => rp.time === time);
        if (existing) removeMut.mutate({ code, date, time });
        else upsertMut.mutate({ stockCode: code, date, time });
    };
    h.current.applyTag = (i) => {
        const preset = tagPresets[i];
        if (!preset?.length || !code || !date || !time) return;
        // 태그는 **타점에 붙는 것** — 그 시각이 저장 타점이 아니면 아무 일도 안 한다(타점 생성은 space 의 몫).
        if (!reviewPoints.some((rp) => rp.time === time)) return;
        const point = { stockCode: code, date, time };
        const { on, tagIds } = presetToggle(tagIdsOf(point), preset);
        if (tagIds.length > 0) applyTags(point, tagIds, on);
    };
    h.current.moveBar = (delta) => {
        if (minutePoints.length === 0) return;
        let idx = minutePoints.findIndex((p) => p.tradeTime === time);
        if (idx < 0) {
            idx = minutePoints.length - 1;
            if (time) for (let i = 0; i < minutePoints.length; i++) { if (minutePoints[i].tradeTime <= time) idx = i; else break; }
        }
        const ni = Math.max(0, Math.min(minutePoints.length - 1, idx + delta));
        useWorkbench.getState().setTime(minutePoints[ni].tradeTime);
    };
    h.current.jump = (dir) => h.current.moveBar(dir * jumpBars);
    h.current.navPoint = (dir) => {
        if (reviewTimes.length === 0) return;
        let target: string;
        if (dir > 0) target = reviewTimes.find((x) => (time ? x > time : true)) ?? reviewTimes[0];
        else {
            const prevs = reviewTimes.filter((x) => (time ? x < time : true));
            target = prevs.length ? prevs[prevs.length - 1] : reviewTimes[reviewTimes.length - 1];
        }
        useWorkbench.getState().goToPoint({ date, code, time: target });
    };

    // 프리셋(1~9 라벨/등록) 변화에만 재등록. 나머지 키는 h.current 로 최신 클로저 접근.
    useEffect(() => {
        const { register, unregister } = useKeymapDynamic.getState();
        const ids: string[] = [];
        const put = (cmd: Command): void => { register(cmd); ids.push(cmd.id); };
        put({ id: "chart.review.toggle", title: "타점 저장/삭제(현재 시각)", category: "차트", keys: "space", run: () => h.current.toggle() });
        tagPresets.forEach((slot, i) => {
            // 지워진 태그는 이름이 없다 → 표기에서 빼고, 슬롯이 통째로 비면 키를 만들지 않는다(빈 커맨드 방지).
            const names = slot.map((id) => tagById.get(id)?.name).filter((n): n is string => !!n);
            if (names.length === 0) return;
            put({ id: `chart.review.tag.${i + 1}`, title: `태그 탈부착: ${names.join(" + ")}`, category: "차트", keys: String(i + 1), run: () => h.current.applyTag(i) });
        });
        put({ id: "chart.nav.prevBar", title: "1봉 이전", category: "차트", keys: "a", run: () => h.current.moveBar(-1) });
        put({ id: "chart.nav.nextBar", title: "1봉 다음", category: "차트", keys: "d", run: () => h.current.moveBar(1) });
        put({ id: "chart.nav.jumpPrev", title: "이동봉 이전", category: "차트", keys: "shift+a", run: () => h.current.jump(-1) });
        put({ id: "chart.nav.jumpNext", title: "이동봉 다음", category: "차트", keys: "shift+d", run: () => h.current.jump(1) });
        put({ id: "chart.nav.prevPoint", title: "이전 타점", category: "차트", keys: "ctrl+a", blockedInInput: true, run: () => h.current.navPoint(-1) });
        put({ id: "chart.nav.nextPoint", title: "다음 타점", category: "차트", keys: "ctrl+d", blockedInInput: true, run: () => h.current.navPoint(1) });
        put({ id: "chart.zoom.toggle", title: "확대/축소", category: "차트", keys: "f", run: () => useWorkbench.getState().toggleChartZoom() });
        return () => ids.forEach(unregister);
    }, [tagPresets, tagById]);
}

export interface MinuteSkeletonForPoint {
    /** 이 타점 골격의 피벗(unix초·raw 가격) — 시간순, 로드된 분봉에서 해소. */
    points: { time: number; price: number }[];
    /** 이 분봉에 찍힌 값들(메뉴 토글 상태). */
    fieldsAt: (anchorTime: string) => AnchorField[];
    /** 이 분봉의 골격 점 토글. 상한(타점 시각)·같은 봉 高低 금지는 서버가 400 으로 막는다. */
    toggle: (anchorTime: string, field: AnchorField) => void;
    clear: () => void;
    hasAny: boolean;
}

/**
 * 분봉 골격 — **타점 소유**라 일봉 골격(차트 소유)과 훅을 갈랐다. activeTime 이 곧 소유자이고,
 * 저장 타점이 아니면(null) 아무것도 못 한다(서버 owner 게이트와 같은 기준 — UI 가 먼저 막는다).
 * 쿼리는 일봉 훅과 같은 키(chartAnchorsQuery)를 써 RQ 가 dedup 한다 — 추가 왕복 없음.
 * 시장은 언제나 UN(분봉 앵커 규칙)이라 토글에 시장 선택이 없다.
 */
export function useMinuteSkeletonForPoint(
    code: string,
    date: string,
    activeTime: string | null,
    minuteBundle: ChartBundle | undefined,
): MinuteSkeletonForPoint {
    const qc = useQueryClient();
    const anchorsQ = useQuery(chartAnchorsQuery(code, date));
    const mine = useMemo(
        () => (anchorsQ.data ?? []).filter((a) => a.param === SKELETON_MINUTE_PARAM && a.time === activeTime && a.field != null && a.anchorTime != null),
        [anchorsQ.data, activeTime],
    );

    const points = useMemo(() => {
        const sorted = sortPivots(mine.map((a) => ({ anchorDate: a.anchorDate, anchorTime: a.anchorTime!, field: a.field!, market: a.market! })));
        const out: { time: number; price: number }[] = [];
        for (const p of sorted) {
            const price = candlePrice(minuteBundle?.minutes.find((c) => c.date === p.anchorDate && c.time === p.anchorTime)?.un?.[p.field]);
            if (price !== null) out.push({ time: kstToUnix(p.anchorDate, p.anchorTime!), price });
        }
        return out;
    }, [mine, minuteBundle]);

    const invalidate = (): void => {
        void qc.invalidateQueries({ queryKey: chartAnchorsQuery(code, date).queryKey });
        void qc.invalidateQueries({ queryKey: computedAxesQuery().queryKey });
    };
    const addMut = useMutation({ mutationFn: addChartAnchor, onSuccess: invalidate });
    const removeMut = useMutation({ mutationFn: removeChartAnchor, onSuccess: invalidate });
    const clearMut = useMutation({
        mutationFn: async () => {
            await Promise.all(mine.map((a) => removeChartAnchor(a.id)));
        },
        onSuccess: invalidate,
    });

    const fieldsAt = (anchorTime: string): AnchorField[] => mine.filter((a) => a.anchorTime === anchorTime).map((a) => a.field!);
    const toggle = (anchorTime: string, field: AnchorField): void => {
        if (!code || !date || !activeTime) return;
        const existing = mine.find((a) => a.anchorTime === anchorTime && a.field === field);
        if (existing) removeMut.mutate(existing.id);
        else addMut.mutate({ stockCode: code, date, time: activeTime, param: SKELETON_MINUTE_PARAM, anchorDate: date, anchorTime, field, market: "un" });
    };

    return { points, fieldsAt, toggle, clear: () => clearMut.mutate(), hasAny: mine.length > 0 };
}
