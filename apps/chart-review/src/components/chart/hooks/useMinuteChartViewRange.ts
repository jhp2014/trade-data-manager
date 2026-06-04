import { useEffect } from "react";
import type { IChartApi } from "lightweight-charts";
import type { MinuteCandle } from "@/types/chart";
import { kstHHmm } from "@trade-data-manager/chart-utils";

interface Params {
    chartRef: React.MutableRefObject<IChartApi | null>;
    candles: MinuteCandle[];
    /** true면 마커 중심 zoomCandles 봉 확대, false면 기본 뷰(clipEnd 시각까지). */
    zoomed: boolean;
    /** 진입 마커 unix(초). 확대 중심. */
    markerTime?: number | null;
    /** 확대 시 보여줄 캔들 수. */
    zoomCandles: number;
    /** 기본 뷰 클립 종료 시각("HH:MM"). 이 시각 이후 봉은 가린다. */
    clipEnd: string;
}

/** "HH:MM" → 분(분 단위 비교용). 형식이 깨지면 매우 큰 값(=항상 통과)으로 처리. */
function hhmmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map((s) => Number(s));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
    return h * 60 + m;
}

/**
 * 분봉 차트의 가시 범위(time scale)를 제어한다.
 *
 * - 기본(zoomed=false): 좌측 5% 여백 ~ clipEnd 시각 캔들 + 우측 2봉.
 *   (오후장 NXT 등 clipEnd 이후 봉은 마우스 스크롤로만 확인)
 * - 확대(zoomed=true): 마커 캔들을 중심으로 zoomCandles 봉.
 *
 * 두 개의 effect 로 분리한 이유:
 *  - 확대 중에는 마커가 이동하면(=markerTime 변경) 그 마커를 다시 중심으로 따라간다.
 *  - 기본 뷰에서는 마커 이동(a/d)이 가시 범위를 건드리지 않아야 한다
 *    (그래야 마우스로 오후장까지 스크롤해둔 위치가 마커 이동마다 리셋되지 않음).
 *    그래서 기본 뷰 effect 의존성에는 markerTime 을 넣지 않는다.
 */
export function useMinuteChartViewRange({
    chartRef,
    candles,
    zoomed,
    markerTime,
    zoomCandles,
    clipEnd,
}: Params) {
    // 확대 추종: 마커 중심 zoomCandles 봉.
    useEffect(() => {
        if (!zoomed || markerTime == null) return;
        const ts = chartRef.current?.timeScale();
        if (!ts || candles.length === 0) return;
        const center = candles.findIndex((c) => c.time === markerTime);
        if (center < 0) return;
        const half = Math.max(1, Math.floor(zoomCandles / 2));
        ts.setVisibleLogicalRange({ from: center - half, to: center + half });
    }, [chartRef, candles, zoomed, markerTime, zoomCandles]);

    // 기본 뷰: clipEnd 시각까지. (markerTime 비의존 — 마커 이동에 스크롤 유지)
    useEffect(() => {
        if (zoomed) return;
        const ts = chartRef.current?.timeScale();
        if (!ts || candles.length === 0) return;
        const clipMin = hhmmToMinutes(clipEnd);
        let clipIdx = candles.length - 1;
        for (let i = candles.length - 1; i >= 0; i--) {
            if (hhmmToMinutes(kstHHmm(candles[i].time)) <= clipMin) {
                clipIdx = i;
                break;
            }
        }
        const leftGap = Math.max(1, Math.round((clipIdx + 1) * 0.05));
        ts.setVisibleLogicalRange({ from: -leftGap, to: clipIdx + 2 });
    }, [chartRef, candles, zoomed, clipEnd]);
}
