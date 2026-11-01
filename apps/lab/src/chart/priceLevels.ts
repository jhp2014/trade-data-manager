// 일봉 선의 가로선 — 캔들 시리즈의 점선 가격선(축 라벨은 값만). 일봉(원화)과 분봉(당일 % 또는 수정주가 원) 두 차트가 같이 쓴다.
// 값의 단위는 그 차트의 축 단위 — 환산은 호출자 몫(분봉 %: lineLevelPct).
import { useEffect, type RefObject } from "react";
import { LineStyle, type ISeriesApi } from "lightweight-charts";

// 선의 두 색 — 차트의 다른 색(봉 빨강·파랑, 시각선 파랑, 고가 % 마커 노랑→주황→빨강→보라, 거래대금 마커 노랑→빨강→분홍)과
// 겹치지 않고 둘끼리도 멀리 떨어진 두 가지: 임시 = 초록, 저장 = 검정에 가까운 먹색.
// 칩은 두 채널로 가른다 — **채움 = 저장, 테두리 = 임시**: 임시만 = 빈 칩 + 초록 테두리 · 저장만 = 먹색 채움 · 둘 다 = 먹색 채움 + 굵은 초록 고리.
/** 임시 선(경로 — 토큰의 손잡이) — 칩 테두리·임시만인 선의 가로선. */
export const TEMP_LINE_COLOR = "#16a34a";
/** 저장된 선(lab 저장소) — 칩 채움·저장된 선의 가로선. */
export const SAVED_LINE_COLOR = "#1f2937";

/** 선의 종류 — 임시만 · 저장만 · 둘 다(임시 선을 저장한 것). 같은 선은 칩 하나로 합친다. */
export type LineKind = "temp" | "saved" | "both";
/** 가로선·드롭선 색 — 저장돼 있으면 저장 색(채움 채널과 같은 뜻). */
export const lineColorOf = (kind: LineKind): string => (kind === "temp" ? TEMP_LINE_COLOR : SAVED_LINE_COLOR);

export interface PriceLevel {
    key: string;
    /** 그 차트 축 단위의 값. */
    value: number;
    /** 생략 = 임시 선 색. */
    color?: string;
    /** 가로선 위 축 옆 글자(일봉 선 = 전날 종가 대비 %). 생략 = 없음. */
    title?: string;
}

/** levels 가 바뀔 때만 다시 긋는다. 시리즈가 먼저 죽었으면(차트 정리) 걷을 것이 없다. */
export function usePriceLevels(candleRef: RefObject<ISeriesApi<"Candlestick"> | null>, gen: number, levels: readonly PriceLevel[]): void {
    const key = levels.map((l) => `${l.key}=${l.value}=${l.color ?? ""}=${l.title ?? ""}`).join("|");
    useEffect(() => {
        const candle = candleRef.current;
        if (!candle) return;
        const made = levels.map((l) =>
            candle.createPriceLine({ price: l.value, color: l.color ?? TEMP_LINE_COLOR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.title ?? "" }),
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
