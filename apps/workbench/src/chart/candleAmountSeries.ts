// 캔들+거래대금 2-pane 시리즈 한 벌 — 일봉·분봉 차트가 **같은 골조**를 쓴다.
//
// 두 훅(useDailySeries·useMinuteSeries)이 이 골조를 각자 60줄로 복제하고 있었다 — 색·pane 비율·
// 마커 플러그인·프리미티브 부착이 글자까지 같은데 파일이 달라, 한쪽만 고치면 두 차트가 조용히 갈라진다.
// 차이는 **캔들의 축 표기뿐**이다(일봉=원화 가격 축 / 분봉=% 축 + autoscale 바닥) — 그래서 그 부분만
// candleOptions 로 받고 나머지는 여기 한 곳에 산다.
//
// 세로선(VertLines)은 캔들 pane 에 항상, 거래대금 pane 에는 옵션으로 붙인다 — 분봉은 타점 세로선이
// 아래 pane 까지 이어져야 하고(같은 timeScale x 공유), 일봉은 검색날짜 선이 캔들 pane 만 쓴다.
import {
    CandlestickSeries,
    HistogramSeries,
    createSeriesMarkers,
    type CandlestickSeriesPartialOptions,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
} from "lightweight-charts";
import { RISE_COLOR, FALL_COLOR, AMOUNT_BAR_COLOR } from "./chartUtils.js";
import { VertLines, asPrimitive } from "./vertLine.js";
import { SkeletonPath, asSkeletonPrimitive } from "./skeletonPath.js";
import { SKELETON } from "../styles/palette.js";

export interface CandleAmountSeries {
    candle: ISeriesApi<"Candlestick">;
    amount: ISeriesApi<"Histogram">;
    markers: ISeriesMarkersPluginApi<Time>;
    candleVerts: VertLines;
    /** amountVerts 옵션을 켰을 때만 — 안 켰으면 null(없는 pane 에 빈 프리미티브를 얹지 않는다). */
    amountVerts: VertLines | null;
    skeleton: SkeletonPath;
    /** 프리미티브 detach — 차트가 이미 파괴된 뒤 불려도 안전(try/catch). */
    dispose: () => void;
}

/**
 * 캔들(pane0) + 거래대금 히스토그램(pane1, 억 표기) + 마커 플러그인 + 세로선·골격 프리미티브.
 * `candleOptions` 가 공통 스타일 위에 덮인다 — 축 표기(priceFormat·autoscale)가 여기로 온다.
 */
export function buildCandleAmountSeries(
    chart: IChartApi,
    opts: { candleOptions: CandlestickSeriesPartialOptions; amountVerts?: boolean },
): CandleAmountSeries {
    const candle = chart.addSeries(CandlestickSeries, {
        upColor: RISE_COLOR,
        downColor: FALL_COLOR,
        borderUpColor: RISE_COLOR,
        borderDownColor: FALL_COLOR,
        wickUpColor: RISE_COLOR,
        wickDownColor: FALL_COLOR,
        priceScaleId: "right",
        priceLineVisible: false,
        ...opts.candleOptions,
    });
    const amount = chart.addSeries(
        HistogramSeries,
        {
            priceScaleId: "right",
            priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(0)}억`, minMove: 1 },
            priceLineVisible: false,
            lastValueVisible: false,
            color: AMOUNT_BAR_COLOR,
        },
        1,
    );
    // 캔들 pane : 거래대금 pane = 3 : 1
    chart.priceScale("right", 1).applyOptions({ borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
    const panes = chart.panes();
    panes[0]?.setStretchFactor(3);
    panes[1]?.setStretchFactor(1);

    const markers = createSeriesMarkers(candle);
    const candleVerts = new VertLines();
    candle.attachPrimitive(asPrimitive(candleVerts));
    let amountVerts: VertLines | null = null;
    if (opts.amountVerts) {
        amountVerts = new VertLines();
        amount.attachPrimitive(asPrimitive(amountVerts));
    }
    // 골격 꺾은선 — 일봉·분봉이 같은 프리미티브(마커 모양·순번 규칙이 갈리면 같은 입력이 다르게 읽힌다).
    const skeleton = new SkeletonPath(SKELETON);
    candle.attachPrimitive(asSkeletonPrimitive(skeleton));

    const dispose = (): void => {
        try {
            candle.detachPrimitive(asPrimitive(candleVerts));
            if (amountVerts) amount.detachPrimitive(asPrimitive(amountVerts));
            candle.detachPrimitive(asSkeletonPrimitive(skeleton));
        } catch {
            /* 차트가 먼저 파괴됨 */
        }
    };
    return { candle, amount, markers, candleVerts, amountVerts, skeleton, dispose };
}

/**
 * 라이브 폴 증분 판정 — `next` 가 `prev` 를 **연장**하는가(같은 데이터셋 + 꼬리만 변화).
 * 조건: 같은 첫 봉 시각 · 길이 ≥ · 마지막 old 봉과 시각 일치(값은 라이브로 변하니 update 로 덮는다) ·
 * 겹치는 구간(마지막 old 봉 제외)이 (time, close) 로 동일. 참조가 같으면 비교 생략(RQ 구조 공유 대비).
 * 통과하면 바뀐 꼬리(마지막 old 봉 + 신규 봉)만 series.update() 로 밀 수 있다 — 실패면 전체 setData.
 * 보수적으로 판정한다: 애매하면 false(정확성 > 절약).
 */
export function extendsPrevBars<T>(
    prev: readonly T[],
    next: readonly T[],
    timeOf: (b: T) => number | string,
    closeOf: (b: T) => number,
): boolean {
    if (prev.length === 0 || next.length < prev.length) return false;
    if (timeOf(prev[0]) !== timeOf(next[0])) return false;
    if (timeOf(prev[prev.length - 1]) !== timeOf(next[prev.length - 1])) return false;
    for (let i = 0; i < prev.length - 1; i++) {
        const a = prev[i];
        const b = next[i];
        if (a === b) continue;
        if (timeOf(a) !== timeOf(b) || closeOf(a) !== closeOf(b)) return false;
    }
    return true;
}

/** setMarkers 스킵 판정용 얕은 비교 — 시각·문구·색이 전부 같으면 같은 마커 한 벌(포지션·모양은 상수). */
export interface MarkerLike {
    time: unknown;
    text?: string;
    color?: string;
}
export function sameMarkers(a: readonly MarkerLike[], b: readonly MarkerLike[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].time !== b[i].time || a[i].text !== b[i].text || a[i].color !== b[i].color) return false;
    }
    return true;
}

/**
 * y(px) 근처의 가격선 찾기 — 우클릭 "이 선을 지운다/메뉴를 연다" 판정. 일봉·분봉이 같은 규칙을 쓰되
 * 가격 → y 환산만 다르다(일봉=raw 가격, 분봉=linePct 로 % 변환) — 그래서 환산을 함수로 받는다.
 * 환산이 null 인 선(분모 없음)은 화면에도 없으므로 판정에서도 빠진다.
 */
export function findLineNearY<L>(
    lines: readonly L[],
    y: number,
    tolPx: number,
    coordOf: (line: L) => number | null,
): L | null {
    for (const line of lines) {
        const ly = coordOf(line);
        if (ly != null && Math.abs(ly - y) <= tolPx) return line;
    }
    return null;
}
