// 일봉 선의 가로선 — 캔들 시리즈의 점선 가격선(축 라벨은 값만). 일봉(원화)과 분봉(당일 % 또는 수정주가 원) 두 차트가 같이 쓴다.
// 값의 단위는 그 차트의 축 단위 — 환산은 호출자 몫(분봉 %: lineLevelPct).
import { useEffect, type RefObject } from "react";
import { LineStyle, type ISeriesApi } from "lightweight-charts";

/** 일봉 선의 색 — 가로선·상단 칩·분봉의 같은 선이 한 색이라 눈이 잇는다. */
export const STATE_LINE_COLOR = "#7c3aed";

export interface PriceLevel {
    key: string;
    /** 그 차트 축 단위의 값. */
    value: number;
}

/** levels 가 바뀔 때만 다시 긋는다. 시리즈가 먼저 죽었으면(차트 정리) 걷을 것이 없다. */
export function usePriceLevels(candleRef: RefObject<ISeriesApi<"Candlestick"> | null>, gen: number, levels: readonly PriceLevel[]): void {
    const key = levels.map((l) => `${l.key}=${l.value}`).join("|");
    useEffect(() => {
        const candle = candleRef.current;
        if (!candle) return;
        const made = levels.map((l) =>
            candle.createPriceLine({ price: l.value, color: STATE_LINE_COLOR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" }),
        );
        return () => {
            if (candleRef.current === candle) for (const pl of made) candle.removePriceLine(pl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, gen]);
}

/**
 * 일봉 선(수정주가 원) → 그 날 분봉의 당일 % — 원주가로 되돌려(× rawScale) % 기준가 대비. 기준가가 없으면(상장 첫날 등)
 * 분봉이 쓰는 대체(그 날 첫 시가)와 같아야 하므로 호출자가 그 값을 base 로 준다.
 */
export function lineLevelPct(adjPrice: number, rawScale: number, base: number): number {
    return ((adjPrice * rawScale - base) / base) * 100;
}
