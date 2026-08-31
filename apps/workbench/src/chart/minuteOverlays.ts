// MinuteChart 의 오버레이들 — 타점 세로선·타점 아이콘 좌표·가격선(%).
// 시리즈/데이터는 minuteSeries, 표시범위는 minuteFraming, 마우스는 minuteInteraction.
import { useEffect, useMemo, type MutableRefObject, type RefObject } from "react";
import { type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { usePriceLineSet, type PriceLineSpec } from "./priceLines.js";
import { type VertLineSpec } from "./vertLine.js";
import { type MinutePoint } from "../lib/derive.js";
import { linePct, snapToBar, type RenderLine } from "../lib/chartFrame.js";
import { ALARM, PRICE_LINE } from "../styles/palette.js";
import { type MinuteSeries } from "./minuteSeries.js";

const MARKER_LINE_COLOR = "#2563eb"; // 현재 타점(Focus.time) 세로선 — 진한 파랑
const SAVED_LINE_COLOR = "rgba(120,120,130,0.45)"; // 저장된 복기 타점 — 흐린 회색
const AUTO_LINE_COLOR = "rgba(22,121,111,0.35)"; // 자동 Point(격자 파생) — 더 흐린 청록(손 타점과 눈으로 갈리게)

/** 저장 타점 입력(스냅 전) — unix초. 축별 상세는 "타점 정보" 패널 몫. */
export interface SavedPointInput {
    time: number;
}

/** 자동 Point 입력(스냅 전) — unix초 + 마커 title 로 쓸 요약 라벨(종류·레벨·대금은 호출자가 접는다). */
export interface AutoPointInput {
    time: number;
    label: string;
}

/**
 * 타점 세로선 — markerTime/저장타점/자동 Point 를 실제 봉 시각으로 스냅(≤ target 최대)해 두 pane
 * primitive 에 push. 자동 Point 는 **저장 타점과 별도 리스트**다 — 한 리스트로 합치면 같은 분의
 * 손·자동이 스냅 dedupe 에 조용히 먹혀 한쪽 마커가 사라진다(이 마커의 존재 이유가 그 구분이다).
 * setLines 는 통째 교체라 스펙 조립도 여기 한 곳이어야 한다(두 훅이 각자 부르면 나중 것이 덮는다).
 */
export function useMarkerVertLines(
    series: MinuteSeries,
    points: MinutePoint[],
    markerTime: number | null,
    savedPoints: SavedPointInput[],
    autoPoints: AutoPointInput[] = [],
): { currentSnapped: number | null; savedSnapped: SavedPointInput[]; autoSnapped: AutoPointInput[] } {
    const currentSnapped = useMemo(() => snapToBar(points, markerTime), [markerTime, points]);
    const snapList = <T extends { time: number }>(list: T[]): T[] => {
        const seen = new Set<number>();
        const out: T[] = [];
        for (const sp of list) {
            const s = snapToBar(points, sp.time);
            if (s != null && !seen.has(s)) {
                seen.add(s);
                out.push({ ...sp, time: s });
            }
        }
        return out;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const savedSnapped = useMemo(() => snapList(savedPoints), [savedPoints, points]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const autoSnapped = useMemo(() => snapList(autoPoints), [autoPoints, points]);

    // 세로선 갱신 — 현재 타점(진한) + 저장 타점(흐린) + 자동 Point(청록). 겹치면 손 타점·현재가 이긴다.
    useEffect(() => {
        const specs: VertLineSpec[] = [];
        const savedTimes = new Set(savedSnapped.map((s) => s.time));
        for (const a of autoSnapped) {
            if (a.time === currentSnapped || savedTimes.has(a.time)) continue;
            specs.push({ time: a.time as UTCTimestamp, color: AUTO_LINE_COLOR, width: 1, dashed: true });
        }
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
    }, [currentSnapped, savedSnapped, autoSnapped]);

    return { currentSnapped, savedSnapped, autoSnapped };
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
    saved: Array<{ x: number; point: MinutePoint | null; time: number }>;
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
