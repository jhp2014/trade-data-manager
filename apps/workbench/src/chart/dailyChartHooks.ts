// DailyChart 의 lightweight-charts 명령형 어댑터 훅들 — 시리즈 수명주기·데이터 푸시·표시범위(f 줌)·
// 마우스 상호작용·가격선·가이드선·검색날짜 세로선을 컴포넌트에서 분리.
// DailyChart.tsx 는 훅 조합 + 툴팁/배지 렌더만 남는다(명령형 API 와 선언형 JSX 의 경계).
// 자매인 분봉은 minuteSeries/minuteFraming/minuteOverlays/minuteInteraction 4파일 — 일봉은 양이 절반이라
// 한 파일이면 족하다. 마우스 정책은 candleInteraction, 골격 수명주기는 useSkeletonPointSet 을 분봉과 공유.
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
import { barSignature, buildCandleAmountSeries, extendsPrevBars, sameMarkers, useAppliedCache, type MarkerLike } from "./candleAmountSeries.js";
import { useCandleInteraction } from "./candleInteraction.js";
import { usePriceLineSet, type PriceLineSpec } from "./priceLines.js";
import { type VertLines } from "./vertLine.js";
import { EMPTY_SKELETON, useSkeletonPointSet, type SkeletonPath } from "./skeletonPath.js";
import { ALARM, DRIFT, GUIDE, IGNORED_CANDLE, PRICE_LINE } from "../styles/palette.js";
import type { DailyPoint } from "../lib/derive.js";
import type { RenderLine } from "../lib/chartFrame.js";

const LEFT_MARGIN_BARS = 3; // 좌측 여백(빈 논리 인덱스)
const RIGHT_MARGIN_BARS = 10; // 우측 여백 — 가격선 라벨(D/M)이 오늘 봉을 가리지 않게

/** 날짜 → 봉 조회 맵. 항상 존재(초기값 빈 맵)이라 current 가 null 이 아니다. */
export type DailyPointMap = { readonly current: Map<string, DailyPoint> };

export interface DailySeries {
    candleRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    amountRef: RefObject<ISeriesApi<"Histogram"> | null>;
    markersRef: RefObject<ISeriesMarkersPluginApi<Time> | null>;
    vertRef: RefObject<VertLines | null>;
    skeletonRef: RefObject<SkeletonPath | null>;
    /**
     * 시리즈 **세대** — 다시 만들어질 때마다 오른다(StrictMode 이중 effect·Fast Refresh).
     * 시리즈는 ref 에 담겨 있어 교체가 렌더를 일으키지 않는다 → 이 값이 없으면 "시리즈만 새로 났고
     * points 는 그대로"인 경우 데이터 effect 가 아예 안 돌아 **빈 차트**가 된다. 소비 effect 의
     * 의존성에 넣어 "새 시리즈에는 다시 밀어 넣는다"를 강제한다. 분봉(MinuteSeries.gen)과 같은 규약.
     */
    gen: number;
}

/** 시리즈 생성(캔들 + 거래대금 pane + 마커 플러그인 + 세로선 프리미티브). 마운트 1회. */
export function useDailySeries(chartRef: RefObject<IChartApi | null>): DailySeries {
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const vertRef = useRef<VertLines | null>(null);
    const skeletonRef = useRef<SkeletonPath | null>(null);
    const [gen, setGen] = useState(0);

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
        setGen((g) => g + 1); // 새 시리즈가 났다 — 데이터·마커 effect 를 다시 태운다
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

    return { candleRef, amountRef, markersRef, vertRef, skeletonRef, gen };
}

/**
 * 데이터 푸시(캔들·거래대금) + 날짜→봉 조회 맵(툴팁·우클릭이 쓴다).
 * 마커는 별도 effect — 무시 캔들은 우클릭 한 번에 바뀌는데 그때마다 setData 까지 다시 태울 이유가 없다.
 */
export function useDailySeriesData(series: DailySeries, points: DailyPoint[], ignoredDates: readonly string[] = []): DailyPointMap {
    const mapRef = useRef<Map<string, DailyPoint>>(new Map());
    const applied = useAppliedCache<ISeriesApi<"Candlestick">, DailyPoint[]>(); // 시리즈에 실제 적용된 마지막 배열
    useEffect(() => {
        const candle = series.candleRef.current;
        const amount = series.amountRef.current;
        if (!candle || !amount) return;
        // 라이브 폴 증분 — 직전 적용분의 연장이면(같은 첫 봉·겹침 (time,지문) 동일) 바뀐 꼬리(오늘 형성봉
        // + 신규 봉)만 update. 어긋나거나 update 가 던지면 전체 setData 폴백(정확성 > 절약). 분봉 훅과 같은 규칙.
        // 직전 적용분은 **이 시리즈에 밀어 넣은 것**만 인정한다(useAppliedCache) — 시리즈가 갈렸으면 전체 setData.
        const prev = applied.read(candle);
        let incremental = false;
        if (prev && extendsPrevBars(prev, points, (p) => p.time, barSignature)) {
            try {
                for (let i = prev.length - 1; i < points.length; i++) {
                    const p = points[i];
                    candle.update({ time: p.time as Time, open: p.open, high: p.high, low: p.low, close: p.close });
                    amount.update({ time: p.time as Time, value: p.amount / 1e8, color: p.close >= p.open ? RISE_FILL : FALL_FILL });
                    mapRef.current.set(p.time, p);
                }
                incremental = true;
            } catch {
                incremental = false; // 아래 전체 setData 가 상태를 복구한다
            }
        }
        if (!incremental) {
            const map = new Map<string, DailyPoint>();
            candle.setData(
                points.map((p) => {
                    map.set(p.time, p);
                    return { time: p.time as Time, open: p.open, high: p.high, low: p.low, close: p.close };
                }),
            );
            mapRef.current = map;
            amount.setData(points.map((p) => ({ time: p.time as Time, value: p.amount / 1e8, color: p.close >= p.open ? RISE_FILL : FALL_FILL })));
        }
        applied.write(candle, points);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, series.gen]);

    // 봉 위 마커 한 벌 — 고가 등락률(임계 이상만) + 무시 표시(계산 축이 없는 셈 치는 봉)를 **한 자리에** 적는다.
    // 무시 대상은 대개 고가가 튄 봉이라 둘이 늘 같은 봉에 걸린다 → 따로 그리면 눈이 두 번 움직이고 자리도 다툰다.
    //
    // 무시 캔들은 tier 색을 회색으로 덮는다. 그 등락률 숫자 자체가 **못 믿겠다고 선언한 고가**에서 나온 값이라,
    // tier 색으로 칠하면 "이 봉 강했다"고 강조하는 셈이 된다(무시는 그 반대 주장이다). 숫자를 남기는 건 읽으라고가
    // 아니라 식별하라고 — 나중에 차트를 다시 열었을 때 "내가 죽인 게 저 봉"을 확인하는 게 무시 표시의 절반이다.
    const ignoredKey = [...ignoredDates].sort().join(",");
    const appliedMarkers = useAppliedCache<ISeriesMarkersPluginApi<Time>, MarkerLike[]>();
    useEffect(() => {
        const plugin = series.markersRef.current;
        if (!plugin) return;
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
        // setMarkers 는 전체 교체 API — 라이브 폴 틱마다 결과가 같으면(대부분) 건너뛴다(sameMarkers 비교).
        // 스킵의 근거도 **이 플러그인에 적용한 것**뿐이다 — 시리즈(=마커 플러그인)가 갈리면 다시 그린다.
        const prevMarkers = appliedMarkers.read(plugin);
        if (prevMarkers === null || !sameMarkers(markers, prevMarkers)) {
            plugin.setMarkers(markers);
            appliedMarkers.write(plugin, markers);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, ignoredKey, series.gen]);
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
 * 마우스 상호작용 — 공통 정책(candleInteraction)에 일봉의 차이만 주입하는 어댑터.
 * 일봉의 몫: 시각=string(날짜)·가격 축이 raw 원화라 캡처/선 판정 모두 환산 없음·주행동=날짜검색.
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
    useCandleInteraction<string>({
        chartRef,
        containerRef,
        lines: args.lines,
        // param.time = 일봉 날짜 문자열(빈 영역이면 undefined).
        resolveTime: (t) => (typeof t === "string" ? t : null),
        // 무장 좌클릭 — 일봉은 가격 축이라 y좌표 → raw 가격 그대로.
        priceOfY: (y) => {
            const price = series.candleRef.current?.coordinateToPrice(y);
            return price == null ? null : (price as number);
        },
        // 우클릭 선 판정 — 환산 없이 raw 가격 → y좌표.
        lineYOf: (line) => {
            const ly = series.candleRef.current?.priceToCoordinate(line.price);
            return ly == null ? null : (ly as number);
        },
        // 봉 → 그 날짜로 검색 모드.
        onPrimaryAction: (date) => args.onCandleClick?.(date),
        onRightClickAt: (date, at) => {
            const p = mapRef.current.get(date);
            if (p) args.onRightClick(p.time, at);
        },
        onRemoveLine: args.onRemoveLine,
        onLineContext: args.onLineContext,
        onPickPrice: args.onPickPrice,
        captureArmed: args.captureArmed,
    });
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
 * 프리미티브에 미는 수명주기는 분봉과 공용(useSkeletonPointSet) — 일봉은 가격 축이라 환산 없이 그대로.
 */
export function useSkeletonOverlay(series: DailySeries, pivots: readonly { date: string; price: number }[] = EMPTY_SKELETON, visible: boolean = true): void {
    const pts = useMemo(() => (visible ? pivots.map((p) => ({ time: p.date, price: p.price })) : []), [pivots, visible]);
    useSkeletonPointSet(series.skeletonRef, pts);
}
