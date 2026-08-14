// DailyChart 의 lightweight-charts 명령형 어댑터 훅들 — 시리즈 수명주기·데이터 푸시·표시범위(f 줌)·
// 마우스 상호작용·가격선·가이드선·검색날짜 세로선을 컴포넌트에서 분리.
// DailyChart.tsx 는 훅 조합 + 툴팁/배지 렌더만 남는다(명령형 API 와 선언형 JSX 의 경계).
// 자매인 MinuteChart 는 진작 minuteChartHooks 로 갈라져 있었는데 일봉만 안 돼 있었다 — 그 비대칭을 없앤다.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";
import { RISE_FILL, FALL_FILL, highMarkerColor } from "./chartUtils.js";
import { isModifiedClick, type ChartClickParam } from "./chartShell.js";
import { buildCandleAmountSeries, findLineNearY } from "./candleAmountSeries.js";
import { usePriceLineSet, type PriceLineSpec } from "./priceLines.js";
import { useLatest } from "../lib/useLatest.js";
import { type VertLines } from "./vertLine.js";
import { type SkeletonPath } from "./skeletonPath.js";
import { ALARM, DRIFT, GUIDE, IGNORED_CANDLE, PRICE_LINE } from "../styles/palette.js";
import type { DailyPoint } from "../lib/derive.js";
import type { RenderLine } from "../lib/chartFrame.js";

const LEFT_MARGIN_BARS = 3; // 좌측 여백(빈 논리 인덱스)
const RIGHT_MARGIN_BARS = 10; // 우측 여백 — 가격선 라벨(D/M)이 오늘 봉을 가리지 않게
const LINE_HIT_PX = 6; // 우클릭이 "이 선을 지운다"로 해석되는 세로 허용 오차

/** 날짜 → 봉 조회 맵. 항상 존재(초기값 빈 맵)이라 current 가 null 이 아니다. */
export type DailyPointMap = { readonly current: Map<string, DailyPoint> };

export interface DailySeries {
    candleRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    amountRef: RefObject<ISeriesApi<"Histogram"> | null>;
    markersRef: RefObject<ISeriesMarkersPluginApi<Time> | null>;
    vertRef: RefObject<VertLines | null>;
    skeletonRef: RefObject<SkeletonPath | null>;
}

/** 시리즈 생성(캔들 + 거래대금 pane + 마커 플러그인 + 세로선 프리미티브). 마운트 1회. */
export function useDailySeries(chartRef: RefObject<IChartApi | null>): DailySeries {
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const vertRef = useRef<VertLines | null>(null);
    const skeletonRef = useRef<SkeletonPath | null>(null);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        // 골조(캔들+거래대금 2-pane·마커·프리미티브)는 분봉과 공용 — 일봉의 몫은 원화 가격 축 표기뿐.
        const s = buildCandleAmountSeries(chart, {
            candleOptions: { lastValueVisible: false, priceFormat: { type: "price", precision: 0, minMove: 1 } },
        });
        candleRef.current = s.candle;
        amountRef.current = s.amount;
        markersRef.current = s.markers;
        vertRef.current = s.candleVerts;
        skeletonRef.current = s.skeleton;
        return () => {
            s.dispose();
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
            vertRef.current = null;
            skeletonRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { candleRef, amountRef, markersRef, vertRef, skeletonRef };
}

/**
 * 데이터 푸시(캔들·거래대금) + 날짜→봉 조회 맵(툴팁·우클릭이 쓴다).
 * 마커는 별도 effect — 무시 캔들은 우클릭 한 번에 바뀌는데 그때마다 setData 까지 다시 태울 이유가 없다.
 */
export function useDailySeriesData(series: DailySeries, points: DailyPoint[], ignoredDates: readonly string[] = []): DailyPointMap {
    const mapRef = useRef<Map<string, DailyPoint>>(new Map());
    useEffect(() => {
        const candle = series.candleRef.current;
        const amount = series.amountRef.current;
        if (!candle || !amount) return;
        const map = new Map<string, DailyPoint>();
        candle.setData(
            points.map((p) => {
                map.set(p.time, p);
                return { time: p.time as Time, open: p.open, high: p.high, low: p.low, close: p.close };
            }),
        );
        mapRef.current = map;
        amount.setData(points.map((p) => ({ time: p.time as Time, value: p.amount / 1e8, color: p.close >= p.open ? RISE_FILL : FALL_FILL })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points]);

    // 봉 위 마커 한 벌 — 고가 등락률(임계 이상만) + 무시 표시(계산 축이 없는 셈 치는 봉)를 **한 자리에** 적는다.
    // 무시 대상은 대개 고가가 튄 봉이라 둘이 늘 같은 봉에 걸린다 → 따로 그리면 눈이 두 번 움직이고 자리도 다툰다.
    //
    // 무시 캔들은 tier 색을 회색으로 덮는다. 그 등락률 숫자 자체가 **못 믿겠다고 선언한 고가**에서 나온 값이라,
    // tier 색으로 칠하면 "이 봉 강했다"고 강조하는 셈이 된다(무시는 그 반대 주장이다). 숫자를 남기는 건 읽으라고가
    // 아니라 식별하라고 — 나중에 차트를 다시 열었을 때 "내가 죽인 게 저 봉"을 확인하는 게 무시 표시의 절반이다.
    const ignoredKey = [...ignoredDates].sort().join(",");
    useEffect(() => {
        const ignored = new Set(ignoredKey ? ignoredKey.split(",") : []);
        const markers = [];
        for (const p of points) {
            const isIgnored = ignored.has(p.time);
            // 등락률은 원래 규칙 그대로(전일종가 없거나 임계 미만이면 없음) — 무시라고 없던 숫자를 만들지 않는다.
            const pct = p.prevClose && p.prevClose > 0 ? ((p.high - p.prevClose) / p.prevClose) * 100 : null;
            const tier = pct === null ? null : highMarkerColor(pct);
            const color = isIgnored ? IGNORED_CANDLE : tier;
            if (color === null) continue; // 등락률도 임계 미만이고 무시도 아님 = 적을 게 없다
            const parts: string[] = [];
            if (tier !== null && pct !== null) parts.push(pct.toFixed(1));
            if (isIgnored) parts.push("무시");
            markers.push({ time: p.time as Time, position: "aboveBar" as const, color, shape: "circle" as const, size: 1, text: parts.join(" · ") });
        }
        series.markersRef.current?.setMarkers(markers);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, ignoredKey]);
    return mapRef;
}

/**
 * 표시 범위 — f 줌인=최근 zoomBars 봉 / 축소=최근 zoomOutBars 봉(~1년, 데이터 적으면 전체).
 * 데이터셋(frameKey)·줌이 바뀔 때만 프레이밍 — effect 의존성 비교가 곧 가드. points 는 의도적으로
 * 의존성 제외(라이브 틱마다 참조만 바뀜): frameKey 가 데이터에서 파생되므로 데이터셋이 실제로 바뀌면
 * frameKey 도 같은 렌더에서 함께 바뀐다. 라이브 틱(폴 갱신)은 리프레임 없이 사용자 줌/이동 보존
 * (lightweight-charts setData 는 범위를 유지).
 */
export function useDailyVisibleRange(
    chartRef: RefObject<IChartApi | null>,
    points: DailyPoint[],
    frameKey: string,
    zoom: boolean,
    zoomBars: number,
    zoomOutBars: number,
): void {
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || points.length === 0) return;
        const n = points.length;
        // 좌측 여백(빈 논리 인덱스, 음수 from 허용) + 우측 여백 — 오늘 봉이 축에 바짝 붙으면
        // 가격선 라벨(priceLine title)이 오늘 봉을 가린다.
        const from = Math.max(0, n - (zoom ? zoomBars : zoomOutBars)) - LEFT_MARGIN_BARS;
        chart.timeScale().setVisibleLogicalRange({ from, to: n + RIGHT_MARGIN_BARS });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameKey, zoom, zoomBars, zoomOutBars]);
}

/**
 * 마우스 상호작용 — hover 추적 · 클릭(날짜검색/가격캡처) · 더블클릭 · 우클릭(선 삭제/추가).
 * 구독은 마운트 1회만 하고, 콜백·무장상태는 매 렌더 ref 로 최신화한다(재구독 없이 최신 클로저).
 */
export function useDailyInteraction(args: {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    series: DailySeries;
    mapRef: DailyPointMap;
    lines: RenderLine[];
    onRightClick: (anchorDate: string, at: { x: number; y: number }) => void;
    onRemoveLine: (line: RenderLine) => void;
    /** 있으면 선 근처 우클릭이 즉시 삭제 대신 이 콜백(메뉴 열기)으로 간다 — 복기 패널이 쓰고 실시간은 즉시 삭제 유지. */
    onLineContext?: (line: RenderLine, at: { x: number; y: number }) => void;
    onCandleClick?: (date: string) => void;
    onPickPrice?: (price: number) => void;
    captureArmed: boolean;
}): void {
    const { chartRef, containerRef, series, mapRef } = args;
    const hoveredTimeRef = useRef<string | null>(null);
    // 리스너는 마운트에 한 번 붙고 args 는 매 렌더 바뀐다 — ref 하나로 최신을 본다(분봉 훅과 같은 방식).
    const cb = useLatest(args);

    useEffect(() => {
        const chart = chartRef.current;
        const el = containerRef.current;
        if (!chart || !el) return;
        const onMove = (param: { time?: unknown }): void => {
            hoveredTimeRef.current = typeof param.time === "string" ? param.time : null;
        };
        chart.subscribeCrosshairMove(onMove);
        // 봉 → 그 날짜로 검색 모드. param.time = 일봉 날짜 문자열(빈 영역이면 undefined).
        const searchAt = (param: ChartClickParam): void => {
            if (typeof param.time === "string") cb.current.onCandleClick?.(param.time);
        };
        // 무장(가격 조건 편집 중) 시 좌클릭 = 그 y좌표 가격을 캡처(캔들 pane0만) — 날짜검색 억제.
        // 아니면 ctrl+클릭만 날짜검색(맨 좌클릭은 팬 몫).
        const onClick = (param: ChartClickParam): void => {
            if (cb.current.captureArmed) {
                if (cb.current.onPickPrice && param.point && (param.paneIndex ?? 0) === 0) {
                    const price = series.candleRef.current?.coordinateToPrice(param.point.y);
                    if (price != null) cb.current.onPickPrice(price as number);
                }
                return; // 무장 중엔 클릭이 캡처 전용
            }
            if (isModifiedClick(param)) searchAt(param);
        };
        // 더블클릭 = ctrl+클릭과 동등. 무장 중엔 캡처가 클릭을 독점하므로 날짜검색으로 새지 않게 막는다.
        const onDblClick = (param: ChartClickParam): void => {
            if (!cb.current.captureArmed) searchAt(param);
        };
        chart.subscribeClick(onClick);
        chart.subscribeDblClick(onDblClick);
        const onCtx = (e: MouseEvent): void => {
            e.preventDefault();
            const candle = series.candleRef.current;
            const y = e.clientY - el.getBoundingClientRect().top;
            // 1) 기존 선 근처 우클릭 → 그 선 삭제. 판정은 분봉과 같은 규칙(findLineNearY) — 환산만 raw 가격.
            if (candle) {
                const hit = findLineNearY(cb.current.lines, y, LINE_HIT_PX, (line) => {
                    const ly = candle.priceToCoordinate(line.price);
                    return ly == null ? null : (ly as number);
                });
                if (hit) {
                    if (cb.current.onLineContext) cb.current.onLineContext(hit, { x: e.clientX, y: e.clientY });
                    else cb.current.onRemoveLine(hit);
                    return;
                }
            }
            // 2) 아니면 hover 봉 컨텍스트 — 복기는 메뉴(가격선 값 선택·파라미터 지정), 실시간은 고가 선 토글.
            const t = hoveredTimeRef.current;
            const p = t ? mapRef.current.get(t) : null;
            if (p) cb.current.onRightClick(p.time, { x: e.clientX, y: e.clientY });
        };
        el.addEventListener("contextmenu", onCtx);
        return () => {
            chart.unsubscribeCrosshairMove(onMove);
            chart.unsubscribeClick(onClick);
            chart.unsubscribeDblClick(onDblClick);
            el.removeEventListener("contextmenu", onCtx);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/** 가격선(D/A) 렌더 — 일봉은 가격 축이라 raw 가격 그대로. 그리기는 usePriceLineSet. */
export function useDailyPriceLines(series: DailySeries, lines: RenderLine[]): void {
    const specs = useMemo<PriceLineSpec[]>(
        () => lines.map((line) => ({
            price: line.price,
            color: line.color ?? (line.kind === "A" ? ALARM : PRICE_LINE),
            title: line.label ?? line.kind,
        })),
        [lines],
    );
    usePriceLineSet(series.candleRef, specs);
}

/** +30% 가이드 가로선 — 검색일 전일종가 ×1.3(= 그 세션 상한가 위치). 성격이 달라 점선. */
export function useGuideLine(series: DailySeries, pctBase: number | null | undefined, showGuide: boolean): void {
    const specs = useMemo<PriceLineSpec[]>(
        () => (showGuide && pctBase != null && pctBase > 0
            ? [{ price: pctBase * 1.3, color: GUIDE, title: "+30%", style: LineStyle.Dotted }]
            : []),
        [pctBase, showGuide],
    );
    usePriceLineSet(series.candleRef, specs);
}

/**
 * 검색날짜 세로선 + 그 x 좌표. 세로선은 차트 프리미티브가 그리고, 날짜 배지는 HTML 이라
 * pan/zoom 마다 x 를 다시 재야 한다(가시범위 변경 구독).
 * @returns 배지를 놓을 x(px). 화면 밖이거나 검색날짜가 없으면 null.
 */
export function useSearchDateLine(chartRef: RefObject<IChartApi | null>, series: DailySeries, searchDate?: string): number | null {
    const [lineX, setLineX] = useState<number | null>(null);

    useEffect(() => {
        series.vertRef.current?.setLines(searchDate ? [{ time: searchDate as unknown as UTCTimestamp, color: DRIFT, width: 1, dashed: true }] : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchDate]);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const ts = chart.timeScale();
        const update = (): void => {
            const c = searchDate ? ts.timeToCoordinate(searchDate as unknown as Time) : null;
            setLineX(c == null ? null : (c as number));
        };
        update();
        ts.subscribeVisibleLogicalRangeChange(update);
        return () => ts.unsubscribeVisibleLogicalRangeChange(update);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchDate]);

    return lineX;
}

/**
 * 골격 오버레이 — 피벗들을 이어 그린다(형태 분류의 입력을 눈으로 확인하는 용도).
 * 그리기는 SkeletonPath primitive 가 한다 — **한 캔들에 점이 여럿**일 수 있어서(시→고→종 = 윗꼬리 슈팅)
 * 시각당 한 점만 받는 LineSeries 로는 그 점들이 화면에서 사라진다(skeletonPath.ts 주석 참조).
 * 점 하나만 찍어도 원이 보이고, 파생된 순번이 함께 적힌다(순서는 입력이 아니라 계산이라 확인이 필요하다).
 */
export function useSkeletonOverlay(series: DailySeries, pivots: readonly { date: string; price: number }[], visible: boolean): void {
    useEffect(() => {
        series.skeletonRef.current?.setPoints(visible ? pivots.map((p) => ({ time: p.date, price: p.price })) : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pivots, visible]);
}
