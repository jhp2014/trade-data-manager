import { useEffect } from "react";
import type { ISeriesApi, Time } from "lightweight-charts";
import type { MinuteCandle } from "@/types/chart";
import { amountMarkerFor } from "@trade-data-manager/chart-utils";

interface Params {
    candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    candles: MinuteCandle[];
    markerTime?: number | null;
}

type MarkerEntry = {
    time: Time;
    position: "aboveBar" | "belowBar";
    color: string;
    shape: "arrowDown" | "circle" | "square";
    text: string;
    size?: number;
};

/**
 * 분봉 캔들 시리즈에 두 종류의 마커를 통합 표시한다.
 *  1) 거래대금 임계 마커 (작은 사각형, 캔들 위)
 *  2) 진입 마커 (큰 화살표) — 같은 봉이면 진입 마커가 우선
 *
 * lightweight-charts 제약:
 *  - 마커 배열은 time 오름차순이어야 함
 *  - 같은 time에 여러 마커 금지 → Map으로 중복 제거
 */
export function useMinuteChartMarkers({ candleSeriesRef, candles, markerTime }: Params) {
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series) return;

        const byTime = new Map<number, MarkerEntry>();

        // 1) 거래대금 임계 마커
        for (const c of candles) {
            const info = amountMarkerFor(c.amount);
            if (!info) continue;
            byTime.set(c.time, {
                time: c.time as Time,
                position: "aboveBar",
                color: info.color,
                shape: "square",
                text: info.text,
                size: 0,
            });
        }

        // 2) 진입 마커 (덮어쓰기 — 같은 봉 우선)
        if (markerTime != null) {
            byTime.set(markerTime, {
                time: markerTime as Time,
                position: "aboveBar",
                color: "#000000ff",
                shape: "arrowDown",
                text: "Point",
            });
        }

        const markers = Array.from(byTime.values()).sort(
            (a, b) => (a.time as number) - (b.time as number),
        );

        series.setMarkers(markers);
    }, [candleSeriesRef, candles, markerTime]);
}
