// MinuteChart 의 lightweight-charts 명령형 어댑터 훅들 — 시리즈 수명주기·데이터 푸시·타점 세로선·
// 표시범위(f 줌)·마우스 상호작용·가격선(%)·오버레이 좌표계산을 컴포넌트에서 분리.
// MinuteChart.tsx 는 훅 조합 + 오버레이/툴팁 렌더만 남는다(명령형 API 와 선언형 JSX 의 경계).
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
    LineStyle,
    type AutoscaleInfo,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type Time,
    type UTCTimestamp,
} from "lightweight-charts";
import { RISE_FILL, FALL_FILL, AMOUNT_BUCKET_COLORS } from "./chartUtils.js";
import { isModifiedClick, type ChartClickParam } from "./chartShell.js";
import { buildCandleAmountSeries, findLineNearY } from "./candleAmountSeries.js";
import { usePriceLineSet, type PriceLineSpec } from "./priceLines.js";
import { useLatest } from "../lib/useLatest.js";
import { amountBucketIndex, AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";

/**
 * 타점 ▼ 마커 표식 — 마커 DOM 에 붙이고, 차트 우클릭 핸들러가 이걸 보고 비켜준다(가격선 대신 그룹 입력창).
 * 마커 렌더(MinuteChart)와 판정(여기)이 서로 다른 파일이라 문자열을 양쪽에 적지 않게 상수로 둔다.
 */
export const GROUP_MARKER_ATTR = "data-group-marker";
import { type VertLines, type VertLineSpec } from "./vertLine.js";
import { type SkeletonPath } from "./skeletonPath.js";
import { minutesOfDay } from "../lib/date.js";
import { type MinutePoint } from "../lib/derive.js";
import { linePct, snapToBar, type RenderLine } from "../lib/chartFrame.js";
import { ALARM, PRICE_LINE } from "../styles/palette.js";

const MARKER_LINE_COLOR = "#2563eb"; // 현재 타점(Focus.time) 세로선 — 진한 파랑
const SAVED_LINE_COLOR = "rgba(120,120,130,0.45)"; // 저장된 복기 타점 — 흐린 회색
const LEFT_MARGIN_BARS = 10; // 좌측 여백(빈 논리 인덱스) — 봉이 축에 바짝 붙지 않게 + 개장 -10분 "여유"
const RIGHT_MARGIN_BARS = 2; // 우측 여백 — 15:30 종가봉이 축에 바짝 붙지 않게
const PREMARKET_OPEN_MIN = 8 * 60; // NXT 프리마켓 개장(08:00) — 프리마켓 봉 있는 UN 종목 세션 시작
const REGULAR_OPEN_MIN = 9 * 60; // 정규장 개장(09:00) — KRX 전용(프리마켓 없는) 종목 세션 시작
const SESSION_CLOSE = "15:30:00"; // 기본 뷰 우단 — 종가 단일가까지. 시간외(~20:00)는 줌아웃/스크롤로 접근


/** 저장 타점 입력(스냅 전) — unix초 + 배치된 축 수(▼ 채움·배지). 축별 상세는 "타점 정보" 패널 몫. */
export interface SavedPointInput {
    time: number;
    placed: number; // 배치된 축 수(0 = 미배치)
}

export interface MinuteSeries {
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    amountRef: MutableRefObject<ISeriesApi<"Histogram"> | null>;
    markersRef: MutableRefObject<ISeriesMarkersPluginApi<Time> | null>;
    candleVertsRef: MutableRefObject<VertLines | null>;
    amountVertsRef: MutableRefObject<VertLines | null>;
    skeletonRef: MutableRefObject<SkeletonPath | null>;
    /** 오버레이(타점 아이콘·정보 박스) 위치 재계산 트리거 — pan/zoom·리사이즈·데이터 변경 시 bump. */
    overlayTick: number;
    bumpOverlay: () => void;
}

/** 시리즈 수명주기 — 캔들(pane0, % 축) + 거래대금(pane1, 억) 1회 생성, 마커 플러그인·세로선 primitive 부착/정리. */
export function useMinuteSeries(chartRef: RefObject<IChartApi | null>): MinuteSeries {
    const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const amountRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const candleVertsRef = useRef<VertLines | null>(null);
    const amountVertsRef = useRef<VertLines | null>(null);
    const skeletonRef = useRef<SkeletonPath | null>(null);
    const [overlayTick, setOverlayTick] = useState(0);
    const bumpOverlay = (): void => setOverlayTick((v) => v + 1);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        // 골조(캔들+거래대금 2-pane·마커·프리미티브)는 일봉과 공용 — 분봉의 몫은 % 축 표기와
        // autoscale 바닥(기본 0~25%, 데이터가 넘으면 확장), 그리고 타점 세로선의 거래대금 pane 연장뿐.
        const s = buildCandleAmountSeries(chart, {
            candleOptions: {
                priceFormat: {
                    type: "custom",
                    formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
                    minMove: 0.01,
                },
                autoscaleInfoProvider: (baseImpl: () => AutoscaleInfo | null) => {
                    const base = baseImpl();
                    return {
                        priceRange: {
                            minValue: Math.min(0, base?.priceRange?.minValue ?? 0),
                            maxValue: Math.max(25, base?.priceRange?.maxValue ?? 0),
                        },
                        margins: base?.margins,
                    };
                },
            },
            amountVerts: true, // 타점 세로선이 아래 pane 까지 이어진다(같은 timeScale x 공유)
        });
        s.candle.createPriceLine({
            price: 0,
            color: "rgba(150,150,150,0.5)",
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: false,
            title: "",
        });
        candleRef.current = s.candle;
        amountRef.current = s.amount;
        markersRef.current = s.markers;
        candleVertsRef.current = s.candleVerts;
        amountVertsRef.current = s.amountVerts;
        skeletonRef.current = s.skeleton;
        // pan/zoom 시 오버레이 아이콘 위치 갱신.
        const ts = chart.timeScale();
        ts.subscribeVisibleLogicalRangeChange(bumpOverlay);
        return () => {
            try {
                ts.unsubscribeVisibleLogicalRangeChange(bumpOverlay);
            } catch {
                /* noop */
            }
            s.dispose();
            candleRef.current = null;
            amountRef.current = null;
            markersRef.current = null;
            candleVertsRef.current = null;
            amountVertsRef.current = null;
            skeletonRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { candleRef, amountRef, markersRef, candleVertsRef, amountVertsRef, skeletonRef, overlayTick, bumpOverlay };
}

export interface MinuteLookups {
    amountMapRef: MutableRefObject<Map<number, number>>;
    cumMapRef: MutableRefObject<Map<number, number>>;
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>;
}

/** points → 시리즈 데이터 푸시 + 툴팁/오버레이 lookup 맵 + 거래대금 구간 마커(토글). */
export function useMinuteSeriesData(series: MinuteSeries, points: MinutePoint[], showAmountMarkers: boolean): MinuteLookups {
    const amountMapRef = useRef<Map<number, number>>(new Map());
    const cumMapRef = useRef<Map<number, number>>(new Map());
    const pointMapRef = useRef<Map<number, MinutePoint>>(new Map());

    useEffect(() => {
        const candle = series.candleRef.current;
        const amount = series.amountRef.current;
        if (!candle || !amount) return;

        candle.setData(
            points.map((p) => ({ time: p.time as UTCTimestamp, open: p.open, high: p.high, low: p.low, close: p.close })),
        );

        const amountMap = new Map<number, number>();
        const cumMap = new Map<number, number>();
        const pointMap = new Map<number, MinutePoint>();
        const bars: Array<{ time: Time; value: number; color: string }> = [];
        for (const p of points) {
            amountMap.set(p.time, p.amount);
            cumMap.set(p.time, p.cumAmount);
            pointMap.set(p.time, p);
            if (p.amount > 0) {
                bars.push({
                    time: p.time as UTCTimestamp,
                    value: p.amount / 1e8,
                    color: p.close >= p.open ? RISE_FILL : FALL_FILL,
                });
            }
        }
        amountMapRef.current = amountMap;
        cumMapRef.current = cumMap;
        pointMapRef.current = pointMap;
        amount.setData(bars);
        // 거래대금 마커 — 분당 거래대금 구간(≥30억) 봉 위에 숫자(구간 하한)만. 토글 OFF 면 비움.
        const markers = [];
        if (showAmountMarkers) {
            for (const p of points) {
                const b = amountBucketIndex(p.amount);
                if (b >= 0) markers.push({ time: p.time as UTCTimestamp, position: "aboveBar" as const, color: AMOUNT_BUCKET_COLORS[b], shape: "circle" as const, size: 0, text: `${AMOUNT_BUCKETS_EOK[b]}` });
            }
        }
        series.markersRef.current?.setMarkers(markers);
        series.bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, showAmountMarkers]);

    return { amountMapRef, cumMapRef, pointMapRef };
}

/** 타점 세로선 — markerTime/저장타점을 실제 봉 시각으로 스냅(≤ target 최대)해 두 pane primitive 에 push. */
export function useMarkerVertLines(
    series: MinuteSeries,
    points: MinutePoint[],
    markerTime: number | null,
    savedPoints: SavedPointInput[],
): { currentSnapped: number | null; savedSnapped: SavedPointInput[] } {
    const currentSnapped = useMemo(() => snapToBar(points, markerTime), [markerTime, points]);
    const savedSnapped = useMemo(() => {
        const seen = new Set<number>();
        const out: SavedPointInput[] = [];
        for (const sp of savedPoints) {
            const s = snapToBar(points, sp.time);
            if (s != null && !seen.has(s)) {
                seen.add(s);
                out.push({ ...sp, time: s }); // 스냅해도 배치 현황은 그 타점의 것을 그대로 들고 간다
            }
        }
        return out;
    }, [savedPoints, points]);

    // 세로선 갱신 — 현재 타점(진한) + 저장 타점(흐린). 두 pane primitive 에 동일 리스트 push.
    useEffect(() => {
        const specs: VertLineSpec[] = [];
        for (const s of savedSnapped) {
            if (s.time === currentSnapped) continue; // 현재 타점과 겹치면 진한 선만
            specs.push({ time: s.time as UTCTimestamp, color: SAVED_LINE_COLOR, width: 1, dashed: true });
        }
        if (currentSnapped != null) {
            specs.push({ time: currentSnapped as UTCTimestamp, color: MARKER_LINE_COLOR, width: 1, dashed: true });
        }
        series.candleVertsRef.current?.setLines(specs);
        series.amountVertsRef.current?.setLines(specs);
        series.bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSnapped, savedSnapped]);

    return { currentSnapped, savedSnapped };
}

/** 표시 범위 — f 줌: anchor 중심 ±bars/2 봉 / 축소: 세션(프리마켓 있으면 07:50, 없으면 08:50 ~ 15:30).
 *  둘 다 논리 인덱스로 프레임(음수 from = 실제 좌측 빈칸, densify 로 분당 연속이라 논리 1칸 = 1분).
 *  데이터셋(frameKey=code:date)·줌이 바뀔 때만 프레이밍 — 같은 데이터셋의 라이브 틱(폴 갱신)은 사용자
 *  줌/이동을 보존한다(setData 는 범위 유지, 새 분봉은 shiftVisibleRangeOnNewBar 가 우측에서만 추종).
 *  lockTimeScale(스케일 고정) — 종목/날짜 전환(frameKey 변경) 시 직전에 보던 **clock 시각 창**을 유지한다.
 *  두 종목의 첫 봉 시각 차(프리마켓 유무=08:00 vs 09:00)만큼 논리 인덱스를 밀어(shift) clock 기준 동일하게
 *  맞춘다 → NXT↔KRX전용 전환도 60분 안 밀림(KRX 전용은 앞에 빈칸이 더 생길 뿐). 복원 원본(범위+첫봉시각)은
 *  cleanup 에서 setData 이전에 캡처 — 뷰가 우측끝이면(KRX 전용=시간외 없어 세션뷰가 곧 우측끝) setData 가
 *  최신 봉을 추종해 스냅되므로, 스냅 이전 값을 잡아야 한다. 첫 마운트는 프레이밍. f 줌 토글은 아래로 흘러 반영. */
export function useMinuteVisibleRange(
    chartRef: RefObject<IChartApi | null>,
    points: MinutePoint[],
    zoom: { bars: number; anchorTime: number | null } | null,
    frameKey: string,
    bumpOverlay: () => void,
    lockTimeScale = false,
): void {
    const prevFrameKeyRef = useRef<string | null>(null); // 직전 데이터셋 — 고정 시 "전환 vs 첫 마운트" 구분용
    const lockedRef = useRef<{ from: number; to: number; firstMin: number } | null>(null); // 전환 직전 뷰(clock 복원용)
    const lockRef = useRef(lockTimeScale); // 토글 자체는 리프레임 트리거가 아님(켜는 순간 뷰 안 움직임) → ref 로만 읽는다
    lockRef.current = lockTimeScale;
    // 리프레임 트리거는 effect 의존성 비교가 곧 가드 — frameKey(데이터 파생)·줌이 바뀔 때만 돈다.
    // points 는 의도적으로 의존성 제외(라이브 틱마다 참조만 바뀜): frameKey 가 데이터에서 파생되므로
    // 데이터셋이 실제로 바뀌면 frameKey 도 같은 렌더에서 함께 바뀐다 — 여기선 최신 points 를 읽기만 한다.
    const zoomSig = zoom ? `${zoom.bars}:${zoom.anchorTime}` : "session";
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || points.length === 0) return;
        const ts = chart.timeScale();
        const prevFrameKey = prevFrameKeyRef.current;
        prevFrameKeyRef.current = frameKey;
        const firstMin = minutesOfDay(points[0].tradeTime); // 이 데이터셋 첫 봉 분(分) — clock↔논리인덱스 변환 기준
        // 스케일 고정 — 전환이면 직전 clock 창 복원. 첫 봉 시각 차만큼 논리 인덱스 시프트(논리 1칸=1분)해
        // clock 기준 동일하게 유지(NXT↔KRX전용도 60분 안 밀림). 첫 마운트(prevFrameKey null)는 프레이밍.
        if (prevFrameKey !== null && prevFrameKey !== frameKey && lockRef.current && lockedRef.current) {
            const shift = lockedRef.current.firstMin - firstMin;
            ts.setVisibleLogicalRange({ from: lockedRef.current.from + shift, to: lockedRef.current.to + shift });
        } else if (zoom) {
            let idx = points.length - 1;
            if (zoom.anchorTime != null) {
                for (let i = 0; i < points.length; i++) { if (points[i].time <= zoom.anchorTime) idx = i; else break; }
            }
            const half = zoom.bars / 2;
            ts.setVisibleLogicalRange({ from: idx - half - LEFT_MARGIN_BARS, to: idx + half });
        } else {
            // 세션 기본 뷰 — 개장 -10분 좌단 ~ 15:30 우단(시간외 ~20:00 는 뷰 밖·데이터 보존).
            // 프리마켓(첫 봉<09:00) 있으면 좌단 07:50(개장 08:00 -10분), 없으면 KRX 전용 → 08:50.
            const openMin = firstMin < REGULAR_OPEN_MIN ? PREMARKET_OPEN_MIN : REGULAR_OPEN_MIN;
            const from = Math.min(0, openMin - LEFT_MARGIN_BARS - firstMin); // clock 좌단 → 첫 봉 기준 논리 인덱스
            let to = points.length - 1;
            for (let i = 0; i < points.length; i++) { if (points[i].tradeTime <= SESSION_CLOSE) to = i; else break; }
            ts.setVisibleLogicalRange({ from, to: to + RIGHT_MARGIN_BARS });
        }
        bumpOverlay();
        // cleanup: 다음 데이터 swap(setData) 이전에 현재 범위+첫봉시각 캡처 → 고정 복원 원본(우측끝 스냅 방지).
        // React 는 "모든 cleanup → 모든 effect" 순이라 이 캡처가 useMinuteSeriesData 의 setData 보다 먼저 돈다.
        return () => {
            try {
                const r = chartRef.current?.timeScale().getVisibleLogicalRange();
                if (r) lockedRef.current = { from: r.from, to: r.to, firstMin };
            } catch { /* chart 파괴됨 */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameKey, zoomSig]);
}

/** 마우스 상호작용 — 좌클릭=그 봉으로 타점 이동, 우클릭=선 근처면 삭제/아니면 hover 봉에 M 선 추가. */
export function useMinuteInteraction(args: {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>;
    lines: RenderLine[]; // 우클릭 라벨-삭제 매칭용(현재 선 데이터)
    base: number | null; // % 기준가(당일 원주가) — M/A 선·가격 캡처 분모
    pctBase: number | null; // % 기준가(수정주가 전일종가) — D 선 분모
    onMovePoint: (time: string) => void;
    onRightClick: (anchor: { date: string; time: string }, at: { x: number; y: number }) => void;
    onRemoveLine: (line: RenderLine) => void;
    /** 있으면 선 근처 우클릭이 즉시 삭제 대신 이 콜백(메뉴 열기)으로 간다 — 복기 패널이 쓰고 실시간은 즉시 삭제 유지. */
    onLineContext?: (line: RenderLine, at: { x: number; y: number }) => void;
    onPickPrice?: (price: number) => void; // 무장 시 좌클릭 y좌표(%) → 가격(base×(1+%/100)) 캡처
    captureArmed?: boolean;
}): void {
    const { chartRef, containerRef, candleRef, pointMapRef } = args;
    const hoveredTimeRef = useRef<number | null>(null);
    // 리스너는 마운트에 한 번 붙고 args 는 매 렌더 바뀐다 — ref 하나로 최신을 본다(일봉 훅과 같은 방식).
    const cb = useLatest(args);

    useEffect(() => {
        const chart = chartRef.current;
        const el = containerRef.current;
        if (!chart || !el) return;
        const onMove = (param: { time?: unknown }): void => {
            hoveredTimeRef.current = typeof param.time === "number" ? param.time : null;
        };
        chart.subscribeCrosshairMove(onMove);
        // 분봉 → 그 시각으로 타점 이동.
        const moveTo = (param: ChartClickParam): void => {
            const t = typeof param.time === "number" ? param.time : null;
            const p = t != null ? pointMapRef.current.get(t) : null;
            if (p) cb.current.onMovePoint(p.tradeTime);
        };
        const onClick = (param: ChartClickParam): void => {
            if (cb.current.captureArmed) {
                // 무장(가격 leaf 편집 중) 시 좌클릭 = y좌표 % → 가격 캡처(캔들 pane0만). 타점 이동 억제.
                const b = cb.current.base;
                if (cb.current.onPickPrice && param.point && (param.paneIndex ?? 0) === 0 && b && b > 0) {
                    const pct = candleRef.current?.coordinateToPrice(param.point.y);
                    if (pct != null) cb.current.onPickPrice(b * (1 + (pct as number) / 100));
                }
                return;
            }
            if (isModifiedClick(param)) moveTo(param); // 맨 좌클릭은 팬 몫
        };
        // 더블클릭 = ctrl+클릭과 동등. 무장 중엔 캡처가 클릭을 독점하므로 타점 이동으로 새지 않게 막는다.
        const onDblClick = (param: ChartClickParam): void => {
            if (!cb.current.captureArmed) moveTo(param);
        };
        chart.subscribeClick(onClick);
        chart.subscribeDblClick(onDblClick);
        const onCtx = (e: MouseEvent): void => {
            e.preventDefault();
            // 타점 ▼ 마커 위 우클릭은 그룹 입력창의 몫 — 여기서 비켜준다.
            // (마커는 이 컨테이너의 자식이라 네이티브 버블이 여기를 **먼저** 지난다. React 쪽 stopPropagation 은
            //  루트 위임이라 이 리스너보다 늦게 돌아 못 막는다 → 목표를 보고 판단하는 이 방식이 유일하게 확실하다.)
            if ((e.target as Element | null)?.closest?.(`[${GROUP_MARKER_ATTR}]`)) return;
            const candle = candleRef.current;
            const y = e.clientY - el.getBoundingClientRect().top;
            // 1) 기존 선(라벨/선) 근처 우클릭 → 그 선 삭제(봉 일일이 찾을 필요 없음). 판정은 일봉과 같은
            //    규칙(findLineNearY) — 환산만 렌더와 같은 linePct(% 축). 분모 없는 선은 화면에도 판정에도 없다.
            if (candle) {
                const hit = findLineNearY(cb.current.lines, y, 6, (line) => {
                    const pct = linePct(line, cb.current.base, cb.current.pctBase);
                    if (pct === null) return null;
                    const ly = candle.priceToCoordinate(pct);
                    return ly == null ? null : (ly as number);
                });
                if (hit) {
                    if (cb.current.onLineContext) cb.current.onLineContext(hit, { x: e.clientX, y: e.clientY });
                    else cb.current.onRemoveLine(hit);
                    return;
                }
            }
            // 2) 아니면 hover 중인 분봉 컨텍스트 — 복기는 메뉴(가격선·파라미터 지정), 실시간은 고가 선 토글.
            const t = hoveredTimeRef.current;
            const p = t != null ? pointMapRef.current.get(t) : null;
            if (p) cb.current.onRightClick({ date: p.date, time: p.tradeTime }, { x: e.clientX, y: e.clientY });
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

// 선의 % 좌표(linePct)는 lib/chartFrame 으로 — RenderLine 의 집이 거기고, 렌더와 우클릭 판정이 같은 함수를 탄다.

/** 가격선(D+M+A) 렌더 — 가격을 %로 변환해 표시(분봉은 % 축). 분모는 linePct 규칙, 그리기는 usePriceLineSet. */
export function usePercentPriceLines(
    candleRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>,
    lines: RenderLine[],
    base: number | null,
    pctBase: number | null,
): void {
    // 분모가 없는 선은 **그리지 않는다**(지어낸 자리에 선을 세우지 않는다 — linePct 의 null 규칙).
    const specs = useMemo<PriceLineSpec[]>(() => {
        const out: PriceLineSpec[] = [];
        for (const line of lines) {
            const pct = linePct(line, base, pctBase);
            if (pct === null) continue;
            out.push({
                price: pct,
                color: line.color ?? (line.kind === "A" ? ALARM : line.kind === "M" ? "#be7a00" : PRICE_LINE),
                title: line.label ?? line.kind,
            });
        }
        return out;
    }, [lines, base, pctBase]);
    usePriceLineSet(candleRef, specs);
}

export interface MarkerOverlay {
    saved: Array<{ x: number; point: MinutePoint | null; time: number; placed: number }>;
    current: { x: number; point: MinutePoint | null } | null;
}

/** 오버레이 좌표 — 스냅된 타점들을 timeScale 좌표로 변환(overlayTick 이 pan/zoom/데이터 변경 재계산 트리거). */
export function useMarkerOverlay(
    chartRef: RefObject<IChartApi | null>,
    series: MinuteSeries,
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>,
    savedSnapped: SavedPointInput[],
    currentSnapped: number | null,
): MarkerOverlay {
    return useMemo(() => {
        void series.overlayTick; // 위치 재계산 의존
        const ts = chartRef.current?.timeScale();
        if (!ts) return { saved: [], current: null };
        const saved = savedSnapped.map((s) => {
            const c = ts.timeToCoordinate(s.time as UTCTimestamp);
            return { ...s, x: c == null ? -9999 : (c as number), point: pointMapRef.current.get(s.time) ?? null };
        });
        let current: MarkerOverlay["current"] = null;
        if (currentSnapped != null) {
            const c = ts.timeToCoordinate(currentSnapped as UTCTimestamp);
            if (c != null) {
                current = { x: c as number, point: pointMapRef.current.get(currentSnapped) ?? null };
            }
        }
        return { saved, current };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series.overlayTick, savedSnapped, currentSnapped]);
}

/**
 * 분봉 골격 오버레이 — 그 **타점**이 찍은 장중 피벗들. 그리기는 일봉과 **같은 SkeletonPath 프리미티브**다.
 *
 * LineSeries 를 안 쓰는 이유가 분봉에서 더 크다: 시각당 점 하나만 받으므로 **한 봉의 시→고→종**이 뭉개지고
 * (분봉에서 훨씬 흔한 입력이다), 점 하나만 찍었을 땐 아무것도 안 그려져 "찍었는데 반응이 없다"가 된다.
 * 프리미티브는 x·y 를 각각 해소해 같은 봉의 두 점을 세로 선분으로 그리고, 점 하나여도 X 마커를 남긴다.
 *
 * **% 변환은 여기서 한다** — 분봉 pane 이 %축이라 raw 가격을 그대로 넘기면 화면 밖으로 날아간다.
 * 분모는 언제나 `base`(당일 원주가): 골격 피벗은 언제나 당일 분봉이라 D 선처럼 pctBase 를 쓸 경우가 없다.
 */
export function useMinuteSkeletonOverlay(
    series: MinuteSeries,
    pivots: readonly { time: number; price: number }[],
    base: number | null,
    visible: boolean,
): void {
    useEffect(() => {
        const show = visible && base !== null && base > 0;
        series.skeletonRef.current?.setPoints(
            show ? pivots.map((p) => ({ time: p.time, price: ((p.price - base!) / base!) * 100 })) : [],
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pivots, base, visible]);
}
