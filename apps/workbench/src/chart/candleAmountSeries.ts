// 캔들+거래대금 2-pane 시리즈 한 벌 — 일봉·분봉 차트가 **같은 골조**를 쓴다.
//
// 두 훅(useDailySeries·useMinuteSeries)이 이 골조를 각자 60줄로 복제하고 있었다 — 색·pane 비율·
// 마커 플러그인·프리미티브 부착이 글자까지 같은데 파일이 달라, 한쪽만 고치면 두 차트가 조용히 갈라진다.
// 차이는 **캔들의 축 표기뿐**이다(일봉=원화 가격 축 / 분봉=% 축 + autoscale 바닥) — 그래서 그 부분만
// candleOptions 로 받고 나머지는 여기 한 곳에 산다.
//
// 세로선(VertLines)은 캔들 pane 에 항상, 거래대금 pane 에는 옵션으로 붙인다 — 분봉은 타점 세로선이
// 아래 pane 까지 이어져야 하고(같은 timeScale x 공유), 일봉은 검색날짜 선이 캔들 pane 만 쓴다.
import { useRef } from "react";
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
 * 겹치는 구간(마지막 old 봉 제외)이 (time, 지문) 으로 동일. 참조가 같으면 비교 생략(RQ 구조 공유 대비).
 * 지문은 close 만이 아니라 O/H/L/거래대금까지 묶는다 — 닫힌 봉의 close 는 그대로인데 다른 필드만
 * 정정되는 드문 케이스에서 close 단독 비교는 통과해 버리고, lastApplied 가 정정본으로 전진해 버려
 * 이후 폴에서도 차이가 영영 안 보인다(자가치유 없는 낡음). 지문이면 그 정정이 setData 폴백을 탄다.
 * 통과하면 바뀐 꼬리(마지막 old 봉 + 신규 봉)만 series.update() 로 밀 수 있다 — 실패면 전체 setData.
 * 보수적으로 판정한다: 애매하면 false(정확성 > 절약).
 */
export function extendsPrevBars<T>(
    prev: readonly T[],
    next: readonly T[],
    timeOf: (b: T) => number | string,
    sigOf: (b: T) => number | string,
): boolean {
    if (prev.length === 0 || next.length < prev.length) return false;
    if (timeOf(prev[0]) !== timeOf(next[0])) return false;
    if (timeOf(prev[prev.length - 1]) !== timeOf(next[prev.length - 1])) return false;
    for (let i = 0; i < prev.length - 1; i++) {
        const a = prev[i];
        const b = next[i];
        if (a === b) continue;
        if (timeOf(a) !== timeOf(b) || sigOf(a) !== sigOf(b)) return false;
    }
    return true;
}

/**
 * "직전에 적용한 것" 캐시 — **그 값을 받은 시리즈에 묶어서** 기억한다.
 *
 * 증분 갱신(extendsPrevBars)·마커 스킵(sameMarkers)은 둘 다 "지금 화면에 붙은 것 = 직전에 내가 밀어
 * 넣은 것"을 전제로 일을 건너뛴다. 그런데 시리즈는 훅 수명 **안에서** 다시 만들어질 수 있고(StrictMode
 * 의 이중 effect, Fast Refresh) 그때 **ref 는 살아남는다** — 전제가 조용히 깨진다. 실제로 그렇게 깨졌다:
 * 첫 차트 마운트에서 setData(2년치) 뒤 시리즈가 새로 태어나고, 살아남은 "직전 적용분"이 연장 판정을
 * 통과해 **꼬리 1봉만 update** 되어 빈 시리즈에 캔들이 하나만 남았다(2026-08-21 보고).
 *
 * 그래서 캐시의 주인을 값이 아니라 **시리즈 인스턴스**로 둔다. 주인이 갈리면 읽기는 null —
 * "직전 적용분 없음" = 전체 setData 경로다. 판정을 보수적으로(애매하면 전체) 미는 이 파일의 규칙과 같다.
 */
export interface AppliedCache<S, V> {
    /** 이 시리즈에 직전 적용한 값. 시리즈가 갈렸으면 null(그 값은 이미 죽은 시리즈의 것이다). */
    read: (series: S) => V | null;
    /** 적용 사실 기록 — 값과 그 값을 받은 시리즈를 함께 묶는다. */
    write: (series: S, value: V) => void;
}

export function useAppliedCache<S, V>(): AppliedCache<S, V> {
    const ownerRef = useRef<S | null>(null);
    const valueRef = useRef<V | null>(null);
    const apiRef = useRef<AppliedCache<S, V> | null>(null);
    if (apiRef.current === null) {
        apiRef.current = {
            read: (series) => (ownerRef.current === series ? valueRef.current : null),
            write: (series, value) => {
                ownerRef.current = series;
                valueRef.current = value;
            },
        };
    }
    return apiRef.current;
}

/** extendsPrevBars 용 봉 지문 — 겹침 구간의 "같은 봉" 판정에 쓰는 필드 묶음. */
export const barSignature = (b: { open: number; high: number; low: number; close: number; amount: number }): string =>
    `${b.open}|${b.high}|${b.low}|${b.close}|${b.amount}`;

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
