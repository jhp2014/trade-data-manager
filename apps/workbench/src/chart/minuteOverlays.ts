// MinuteChart 의 오버레이들 — 타점 세로선·타점 아이콘 좌표·가격선(%)·골격(%).
// 시리즈/데이터는 minuteSeries, 표시범위는 minuteFraming, 마우스는 minuteInteraction.
import { useEffect, useMemo, type MutableRefObject, type RefObject } from "react";
import { type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { usePriceLineSet, type PriceLineSpec } from "./priceLines.js";
import { type VertLineSpec } from "./vertLine.js";
import { EMPTY_SKELETON, useSkeletonPointSet } from "./skeletonPath.js";
import { type MinutePoint } from "../lib/derive.js";
import { linePct, snapToBar, type RenderLine } from "../lib/chartFrame.js";
import { ALARM, PRICE_LINE } from "../styles/palette.js";
import { type MinuteSeries } from "./minuteSeries.js";

const MARKER_LINE_COLOR = "#2563eb"; // 현재 타점(Focus.time) 세로선 — 진한 파랑
const SAVED_LINE_COLOR = "rgba(120,120,130,0.45)"; // 저장된 복기 타점 — 흐린 회색

/** 저장 타점 입력(스냅 전) — unix초 + 배치된 축 수(▼ 채움·배지). 축별 상세는 "타점 정보" 패널 몫. */
export interface SavedPointInput {
    time: number;
    placed: number; // 배치된 축 수(0 = 미배치)
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
 * 프리미티브에 미는 수명주기는 일봉과 공용(useSkeletonPointSet) — 여긴 환산·표시 여부만 정한다.
 */
export function useMinuteSkeletonOverlay(
    series: MinuteSeries,
    pivots: readonly { time: number; price: number }[] = EMPTY_SKELETON, // 기본값 = 안정 참조(effect 헛돌지 않게)
    base: number | null,
    visible: boolean,
): void {
    const pts = useMemo(() => {
        const show = visible && base !== null && base > 0;
        return show ? pivots.map((p) => ({ time: p.time, price: ((p.price - base!) / base!) * 100 })) : [];
    }, [pivots, base, visible]);
    useSkeletonPointSet(series.skeletonRef, pts);
}
