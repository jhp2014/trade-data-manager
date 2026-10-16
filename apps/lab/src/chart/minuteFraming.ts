// MinuteChart 의 표시범위 — 세션 기본 뷰(프리마켓 있으면 07:50, 없으면 08:50 ~ 15:30), f 줌(시각 가운데 N봉),
// 그리고 시각 선 따라가기(선이 화면 가장자리를 넘으면 안쪽으로 당겨 온다).
import { useEffect, type RefObject } from "react";
import { type IChartApi } from "lightweight-charts";
import { indexAtOrBefore, minutesOfDay } from "./bars.js";
import { type MinutePoint } from "./derive.js";

const LEFT_MARGIN_BARS = 10; // 좌측 여백 — 개장 -10분
const RIGHT_MARGIN_BARS = 2; // 우측 여백 — 15:30 종가봉이 축에 붙지 않게
const PREMARKET_OPEN_MIN = 8 * 60; // NXT 프리마켓 개장(08:00)
const REGULAR_OPEN_MIN = 9 * 60; // 정규장 개장(09:00) — KRX 전용 종목
const SESSION_CLOSE = "15:30:00"; // 기본 뷰 우단. 시간외(~20:00)는 줌아웃·스크롤로
/** 따라가기 — 선이 화면 폭의 이 비율보다 가장자리에 붙으면 옮긴다. */
const FOLLOW_EDGE = 0.05;
/** 따라가기 — 옮긴 뒤 선이 가장자리에서 이 비율만큼 안쪽에 온다(딱 붙이지 않고 가운데 쪽으로 넉넉히). */
const FOLLOW_INSET = 0.3;

type LogicalRange = { from: number; to: number };

/** f 줌 범위 — idx 봉을 가운데로 bars 봉(왼쪽 여백 포함). */
export function zoomRange(idx: number, bars: number): LogicalRange {
    return { from: idx - bars / 2 - LEFT_MARGIN_BARS, to: idx + bars / 2 };
}

/**
 * 따라가기 — idx 봉이 보이는 범위의 가장자리(폭의 FOLLOW_EDGE)를 넘으면 폭은 그대로, idx 가 그 가장자리에서
 * 폭의 FOLLOW_INSET 안쪽에 오는 범위. 안쪽이면 null(옮기지 않는다).
 */
export function followRange(range: LogicalRange, idx: number): LogicalRange | null {
    const span = range.to - range.from;
    let from: number;
    if (idx > range.to - span * FOLLOW_EDGE) from = idx + span * FOLLOW_INSET - span;
    else if (idx < range.from + span * FOLLOW_EDGE) from = idx - span * FOLLOW_INSET;
    else return null;
    return { from, to: from + span };
}

const markerIndex = (points: MinutePoint[], t: number): number => indexAtOrBefore(points, (p) => p.time <= t);

/**
 * 데이터셋(frameKey = code:date)이 바뀌거나 줌이 켜지고 꺼질 때만 프레이밍한다 — 같은 데이터셋의 재렌더는
 * 사용자 줌·이동을 보존. 줌은 켜는 순간의 시각(anchorTime)을 가운데로 zoomBars 봉.
 * 분봉은 dense(분당 연속)라 논리 인덱스 1칸 = 1분이고, 음수 from = 첫 봉 앞의 빈칸이다.
 */
export function useMinuteVisibleRange(
    chartRef: RefObject<IChartApi | null>,
    points: MinutePoint[],
    frameKey: string,
    zoomBars: number | null,
    anchorTime: number | null,
): void {
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || points.length === 0) return;
        if (zoomBars !== null) {
            chart.timeScale().setVisibleLogicalRange(zoomRange(anchorTime === null ? points.length - 1 : markerIndex(points, anchorTime), zoomBars));
            return;
        }
        const firstMin = minutesOfDay(points[0].tradeTime);
        const openMin = firstMin < REGULAR_OPEN_MIN ? PREMARKET_OPEN_MIN : REGULAR_OPEN_MIN;
        const from = Math.min(0, openMin - LEFT_MARGIN_BARS - firstMin);
        let to = points.length - 1;
        for (let i = 0; i < points.length; i++) {
            if (points[i].tradeTime <= SESSION_CLOSE) to = i;
            else break;
        }
        chart.timeScale().setVisibleLogicalRange({ from, to: to + RIGHT_MARGIN_BARS });
        // points 는 frameKey 와 함께 바뀐다. anchorTime 은 a/d 마다 바뀌지만 그때 다시 프레이밍하지 않는다 — 줌은
        // 켜는(또는 데이터셋이 바뀌는) 순간의 시각을 가운데로 잡고, 그 뒤 선은 따라가기(useFollowMarker)가 맡는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameKey, zoomBars]);
}

/**
 * 시각 선 따라가기(followRange) — 선이 움직였을 때, 그리고 다시 프레이밍한 뒤(데이터셋 바뀜 · 줌 켜고 끔).
 * 선이 화면 안에 있으면 건드리지 않는다(사용자가 잡아 둔 화면 존중). 표시범위 훅(useMinuteVisibleRange) 뒤에
 * 둔다 — 같은 커밋에서 새 프레이밍을 기준으로 잰다.
 */
export function useFollowMarker(chartRef: RefObject<IChartApi | null>, points: MinutePoint[], markerTime: number | null, frameKey: string, zoomBars: number | null): void {
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || markerTime === null || points.length === 0) return;
        const range = chart.timeScale().getVisibleLogicalRange();
        const next = range ? followRange(range, markerIndex(points, markerTime)) : null;
        if (next) chart.timeScale().setVisibleLogicalRange(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [markerTime, frameKey, zoomBars]);
}
