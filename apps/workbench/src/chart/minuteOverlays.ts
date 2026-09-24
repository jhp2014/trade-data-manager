// MinuteChart 의 오버레이들 — 타점 세로선·타점 아이콘 좌표·가격선(%).
// 시리즈/데이터는 minuteSeries, 표시범위는 minuteFraming, 마우스는 minuteInteraction.
import { useEffect, useMemo, type MutableRefObject, type RefObject } from "react";
import { type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { usePriceLineSet, type PriceLineSpec } from "./priceLines.js";
import { type VertLineSpec } from "./vertLine.js";
import { buildLegSpecs } from "./legMark.js";
import { buildChainLayerSpec, EMPTY_CHAIN_LAYER, type ChainOverlayInput } from "./chainLayer.js";
import { HIGH_GAP } from "../lib/anchorMarks.js";
import { MARKER_RESERVE } from "./anchorMarkOverlay.js";
import { amountBucketIndex } from "@trade-data-manager/market/domain";
import { type MinutePoint } from "../lib/derive.js";
import { linePct, snapToBar, type RenderLine } from "../lib/chartFrame.js";
import { ALARM, PRICE_LINE } from "../styles/palette.js";
import { type MinuteSeries } from "./minuteSeries.js";

const MARKER_LINE_COLOR = "#2563eb"; // 현재 타점(Focus.time) 세로선 — 진한 파랑
// (옛 AUTO_LINE_COLOR 폐지 — 아래 주석 참조)

/** 자동 Point 입력(스냅 전) — unix초 + 마커 title 로 쓸 요약 라벨(종류·레벨·대금은 호출자가 접는다). */
export interface AutoPointInput {
    time: number;
    label: string;
}

/** 좌표 라벨 입력(스냅 전) — 라벨=타점(그룹 배정 좌표)의 ◆ 표식. color = 첫 그룹의 groupColor. */
export interface LabelPointInput {
    time: number;
    label: string;
    color: string;
}

const NO_TIMES: readonly number[] = [];

/** 목록을 실제 봉 시각으로 스냅(≤ target 최대, 같은 봉 중복 제거) — 자동 Point ◇ 와 라벨 ◆ 가 같은 자를 쓴다. */
export function snapPoints<T extends { time: number }>(points: MinutePoint[], list: readonly T[]): T[] {
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
}

/**
 * 타점 세로선 — **현재 시각 하나뿐**이다(2026-09-18 단계 ③).
 *
 * 옛 구현은 후보마다 흐린 점선을 깔았는데 화면이 난잡했다. 그리고 그 선은 없어도 된다:
 * **타점으로 이동하면 `markerTime` 이 그 좌표라 파란 선이 이미 거기 선다** — "선택된 타점 선"을
 * 따로 만들 필요가 없었다. 거래대금 pane 의 선도 같은 배열이라 함께 걷혔다.
 * `autoSnapped` 반환은 유지한다 — ◇ 마커의 x 좌표 스냅에 여전히 쓰인다.
 * (다리 고점은 세로선이 아니라 드롭 캡/띠 — useLegMarks 가 별도 primitive 로 진다: 형태가 같으면 안 갈린다.)
 */
export function useMarkerVertLines(
    series: MinuteSeries,
    points: MinutePoint[],
    markerTime: number | null,
    autoPoints: AutoPointInput[] = [],
): { currentSnapped: number | null; autoSnapped: AutoPointInput[] } {
    const currentSnapped = useMemo(() => snapToBar(points, markerTime), [markerTime, points]);
    const autoSnapped = useMemo(() => snapPoints(points, autoPoints), [autoPoints, points]);

    // 세로선 갱신 — 현재 시간선 하나. `autoSnapped` 는 의존에서 뺀다(선과 무관해졌다 — 넣어 두면
    // 후보 목록이 바뀔 때마다 setLines·bumpOverlay 가 헛발화한다).
    useEffect(() => {
        const specs: VertLineSpec[] = currentSnapped == null
            ? []
            : [{ time: currentSnapped as UTCTimestamp, color: MARKER_LINE_COLOR, width: 1, dashed: true }];
        series.candleVertsRef.current?.setLines(specs);
        series.amountVertsRef.current?.setLines(specs);
        series.bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSnapped]);

    return { currentSnapped, autoSnapped };
}

/**
 * 다리 표식(고점 렌즈) — 드롭 캡(고점 봉 전부) + 다리 띠(선택 시그널 하나). 스펙 조립은 buildLegSpecs(순수),
 * 여기는 스냅 결과를 primitive 에 미는 배선만. 갱신 렌즈·실시간 차트는 빈 입력이라 아무것도 안 그린다.
 * 마커 규칙은 anchorMarkArgs 의 분봉 판정과 같은 함수(amountBucketIndex)를 쓴다 — 두 벌이면 예약분이 갈린다.
 */
export function useLegMarks(
    series: MinuteSeries,
    points: MinutePoint[],
    highTimes: readonly number[] = NO_TIMES,
    band: { from: number; to: number } | null = null,
    showAmountMarkers = false,
): void {
    useEffect(() => {
        const specs = buildLegSpecs(points, highTimes, band, (p) => showAmountMarkers && amountBucketIndex(p.amount) >= 0);
        series.legRef.current?.set(specs.caps, specs.band);
        series.bumpOverlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, highTimes, band, showAmountMarkers, series.gen]);
}

/**
 * 사슬 층 — 돌파 사슬 띠·후보 ▼·밴드 계단(chainLayer). 입력이 null 이면 비운다(층 꺼짐·재료 없음).
 * ▼ 의 고가 위 예약 공간은 다리 캡·드롭선과 **같은 계약**(HIGH_GAP + 거래대금 마커 예약분).
 */
export function useChainLayer(
    series: MinuteSeries,
    points: MinutePoint[],
    input: ChainOverlayInput | null,
    showAmountMarkers = false,
): void {
    useEffect(() => {
        const spec = input === null
            ? EMPTY_CHAIN_LAYER
            : buildChainLayerSpec(points, input, (p) => HIGH_GAP + (showAmountMarkers && amountBucketIndex(p.amount) >= 0 ? MARKER_RESERVE : 0));
        series.chainRef.current?.set(spec);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [points, input, showAmountMarkers, series.gen]);
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
    /** 타점 마커 좌표(자동 Point) — 시간순, x < 0 = 화면 밖. */
    marks: Array<{ x: number; point: MinutePoint | null; time: number }>;
    current: { x: number; point: MinutePoint | null } | null;
}

/** 오버레이 좌표 — 스냅된 타점들을 timeScale 좌표로 변환(overlayTick 이 pan/zoom/데이터 변경 재계산 트리거). */
export function useMarkerOverlay(
    chartRef: RefObject<IChartApi | null>,
    series: MinuteSeries,
    pointMapRef: MutableRefObject<Map<number, MinutePoint>>,
    snapped: readonly { time: number; label?: string }[],
    currentSnapped: number | null,
): MarkerOverlay {
    return useMemo(() => {
        void series.overlayTick; // 위치 재계산 의존
        const ts = chartRef.current?.timeScale();
        if (!ts) return { marks: [], current: null };
        const marks = snapped.map((s) => {
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
        return { marks, current };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series.overlayTick, snapped, currentSnapped]);
}
