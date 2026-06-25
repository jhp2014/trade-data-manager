import { useEffect } from "react";
import type { ISeriesMarkersPluginApi, Time } from "lightweight-charts";
import type { MinuteCandle } from "@/types/chart";
import { amountMarkerFor } from "@trade-data-manager/chart-utils";
import { amountToEokInt } from "@/lib/format";

interface Params {
    /** 캔들 시리즈와 한 생명주기로 생성된 마커 플러그인 핸들(useMinuteChartSeries 소유). */
    candleMarkersRef: React.MutableRefObject<ISeriesMarkersPluginApi<Time> | null>;
    candles: MinuteCandle[];
    markerTime?: number | null;
    /** Point List에 저장된 타점들의 봉 시각(unix 초). 차트에 ●/거래대금 으로 표시. */
    pointTimes?: number[];
}

type MarkerEntry = {
    time: Time;
    position: "aboveBar" | "belowBar";
    color: string;
    shape: "arrowDown" | "arrowUp" | "circle" | "square";
    text: string;
    size?: number;
};

/**
 * 분봉 캔들 시리즈에 세 종류의 마커를 통합 표시한다.
 *  1) 거래대금 임계 마커 (작은 사각형, 캔들 위)
 *  2) Point List 타점 마커 (원, ●/거래대금) — Point List에 저장된 타점 위치
 *  3) 진입 마커 (큰 화살표) — 같은 봉이면 진입 마커가 우선
 *
 * 우선순위(같은 봉): 임계 사각형 < 타점 원 < 진입 화살표.
 *
 * lightweight-charts 제약:
 *  - 마커 배열은 time 오름차순이어야 함
 *  - 같은 time에 여러 마커 금지 → Map으로 중복 제거
 */
export function useMinuteChartMarkers({ candleMarkersRef, candles, markerTime, pointTimes }: Params) {
    useEffect(() => {
        const markersApi = candleMarkersRef.current;
        if (!markersApi) return;

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

        // 2) Point List 타점 마커. 캔들 "아래"에 작은 원으로 표시해 진입 화살표/거래대금
        //    임계 사각형(둘 다 위쪽)과 시각적으로 분리한다. 텍스트는 거래대금(억)만.
        //    현재 진입 마커와 같은 봉이면 아래 3)에서 덮어씀.
        if (pointTimes) {
            for (const pt of pointTimes) {
                if (pt === markerTime) continue;
                const pc = candles.find((c) => c.time === pt);
                const eok = amountToEokInt(pc?.amount);
                byTime.set(pt, {
                    time: pt as Time,
                    position: "belowBar",
                    color: "#64748b",
                    shape: "arrowUp",
                    text: eok != null ? String(eok) : "",
                });
            }
        }

        // 3) 진입 마커 (덮어쓰기 — 같은 봉 우선). 텍스트에 해당 봉 거래대금(억, 반올림) 부착.
        if (markerTime != null) {
            const mc = candles.find((c) => c.time === markerTime);
            const eok = amountToEokInt(mc?.amount);
            byTime.set(markerTime, {
                time: markerTime as Time,
                position: "aboveBar",
                color: "#000000ff",
                shape: "arrowDown",
                text: eok != null ? `Point/${eok}` : "Point",
            });
        }

        const markers = Array.from(byTime.values()).sort(
            (a, b) => (a.time as number) - (b.time as number),
        );

        markersApi.setMarkers(markers);
    }, [candleMarkersRef, candles, markerTime, pointTimes]);
}
