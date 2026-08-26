// 표식 배치에 필요한 **차트별 어댑터** — 공통 계산(anchorMarkOverlay)에 일봉/분봉의 차이만 주입한다.
//
// 차이는 셋뿐이다: ① 봉을 찾는 열쇠(일봉=날짜 / 분봉=날짜+시각) ② 가격 축 단위(일봉=원 / 분봉=%)
// ③ 봉 위 기존 마커의 규칙(일봉=고가 등락률 tier / 분봉=거래대금 구간). 그 셋을 여기서 닫고
// 나머지(줄 쌓기·드롭선·창 밖 판정)는 두 차트가 같은 함수를 탄다.
//
// `hasMarkerAt` 은 각 차트의 **마커 규칙을 그대로 되짚는다** — 마커가 있는 봉은 드롭선 끝을 그만큼
// 더 띄워야 관통하지 않는다. 규칙이 두 벌이 되지 않도록 판정 함수(highMarkerColor·amountBucketIndex)를
// 마커를 그리는 쪽과 **같은 것**으로 부른다.
import { useCallback, useMemo, type RefObject } from "react";
import type { IChartApi, Time, UTCTimestamp } from "lightweight-charts";
import type { AnchorMark } from "../lib/anchorMarks.js";
import type { DailyPoint, MinutePoint } from "../lib/derive.js";
import { amountBucketIndex } from "@trade-data-manager/market/domain";
import { highMarkerColor } from "./chartUtils.js";

const EMPTY_MARKS: readonly AnchorMark[] = [];

/** 어댑터가 채우는 몫 — 나머지(chartRef·dropRef·topPad 등)는 부르는 차트가 채운다. */
export interface AnchorMarkArgs {
    marks: readonly AnchorMark[];
    xOf: (m: AnchorMark) => number | null;
    highOf: (m: AnchorMark) => number | null;
    hasMarkerAt: (m: AnchorMark) => boolean;
    timeOf: (m: AnchorMark) => Time;
    /** ◀▶ 칩 클릭 — 그 방향 끝 표식이 화면 가운데 오게 가로 이동(현재 창 폭 유지). */
    goTo: (side: "left" | "right") => void;
}

/** 논리 인덱스 기반 가로 이동 — 세로 가상화와 무관한 화면이라 차트 API 직접이 맞다. */
function scrollToIndex(chart: IChartApi | null, idx: number): void {
    if (!chart || idx < 0) return;
    const ts = chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    const span = r ? r.to - r.from : 60;
    ts.setVisibleLogicalRange({ from: idx - span / 2, to: idx + span / 2 });
}

export function useDailyAnchorMarkArgs(
    chartRef: RefObject<IChartApi | null>,
    points: DailyPoint[],
    anchorMarks: readonly AnchorMark[] | undefined,
): AnchorMarkArgs {
    const marks = anchorMarks ?? EMPTY_MARKS;
    const byDate = useMemo(() => {
        const m = new Map<string, { p: DailyPoint; idx: number }>();
        points.forEach((p, idx) => m.set(p.time, { p, idx }));
        return m;
    }, [points]);

    const xOf = useCallback((mk: AnchorMark): number | null => {
        const ts = chartRef.current?.timeScale();
        if (!ts || !byDate.has(mk.anchorDate)) return null; // 그 봉이 시리즈에 없다
        const c = ts.timeToCoordinate(mk.anchorDate as Time);
        return c === null ? null : (c as number);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [byDate]);
    const highOf = useCallback((mk: AnchorMark): number | null => byDate.get(mk.anchorDate)?.p.high ?? null, [byDate]);
    // 일봉 마커 규칙 = 고가 등락률이 임계 이상일 때만(무시 여부는 색만 덮는다 — 마커 유무를 안 바꾼다).
    const hasMarkerAt = useCallback((mk: AnchorMark): boolean => {
        const p = byDate.get(mk.anchorDate)?.p;
        if (!p || !p.prevClose || p.prevClose <= 0) return false;
        return highMarkerColor(((p.high - p.prevClose) / p.prevClose) * 100) !== null;
    }, [byDate]);
    const timeOf = useCallback((mk: AnchorMark): Time => mk.anchorDate as Time, []);
    const goTo = useCallback((side: "left" | "right"): void => {
        let best: number | null = null;
        for (const mk of marks) {
            const idx = byDate.get(mk.anchorDate)?.idx;
            if (idx === undefined) continue;
            if (best === null || (side === "left" ? idx < best : idx > best)) best = idx;
        }
        if (best !== null) scrollToIndex(chartRef.current, best);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [marks, byDate]);

    return useMemo(() => ({ marks, xOf, highOf, hasMarkerAt, timeOf, goTo }), [marks, xOf, highOf, hasMarkerAt, timeOf, goTo]);
}

export function useMinuteAnchorMarkArgs(
    chartRef: RefObject<IChartApi | null>,
    points: MinutePoint[],
    anchorMarks: readonly AnchorMark[] | undefined,
    showAmountMarkers: boolean,
): AnchorMarkArgs {
    const marks = anchorMarks ?? EMPTY_MARKS;
    const byKey = useMemo(() => {
        const m = new Map<string, { p: MinutePoint; idx: number }>();
        points.forEach((p, idx) => m.set(`${p.date}T${p.tradeTime}`, { p, idx }));
        return m;
    }, [points]);
    const hit = (mk: AnchorMark): { p: MinutePoint; idx: number } | undefined =>
        mk.anchorTime === undefined ? undefined : byKey.get(`${mk.anchorDate}T${mk.anchorTime}`);

    const xOf = useCallback((mk: AnchorMark): number | null => {
        const ts = chartRef.current?.timeScale();
        const h = hit(mk);
        if (!ts || !h) return null;
        const c = ts.timeToCoordinate(h.p.time as UTCTimestamp);
        return c === null ? null : (c as number);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [byKey]);
    // 분봉 캔들 축은 % — 그래서 high(등락률)를 그대로 준다(highPrice 는 원주가라 축이 다르다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const highOf = useCallback((mk: AnchorMark): number | null => hit(mk)?.p.high ?? null, [byKey]);
    // 분봉 마커 규칙 = 거래대금 구간(토글 OFF 면 마커 자체가 없다).
    const hasMarkerAt = useCallback((mk: AnchorMark): boolean => {
        if (!showAmountMarkers) return false;
        const p = hit(mk)?.p;
        return p !== undefined && amountBucketIndex(p.amount) >= 0;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [byKey, showAmountMarkers]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const timeOf = useCallback((mk: AnchorMark): Time => (hit(mk)?.p.time ?? 0) as Time, [byKey]);
    const goTo = useCallback((side: "left" | "right"): void => {
        let best: number | null = null;
        for (const mk of marks) {
            const h = hit(mk);
            if (!h) continue;
            if (best === null || (side === "left" ? h.idx < best : h.idx > best)) best = h.idx;
        }
        if (best !== null) scrollToIndex(chartRef.current, best);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [marks, byKey]);

    return useMemo(() => ({ marks, xOf, highOf, hasMarkerAt, timeOf, goTo }), [marks, xOf, highOf, hasMarkerAt, timeOf, goTo]);
}
