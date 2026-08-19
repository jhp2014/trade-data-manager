// MinuteChart 의 마우스 상호작용 — 공통 정책(candleInteraction)에 분봉의 차이만 주입하는 어댑터.
// 좌클릭=그 봉으로 타점 이동, 우클릭=선 근처면 삭제/아니면 hover 봉에 M 선 추가.
import { type MutableRefObject, type RefObject } from "react";
import { type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useCandleInteraction } from "./candleInteraction.js";
import { linePct, type RenderLine } from "../lib/chartFrame.js";
import { type MinutePoint } from "../lib/derive.js";

/**
 * 타점 ▼ 마커 표식 — 마커 DOM 에 붙이고, 차트 우클릭 핸들러가 이걸 보고 비켜준다(가격선 대신 그룹 입력창).
 * 마커 렌더(MinuteChart)와 판정(공통 정책의 escapeSelector)이 서로 다른 파일이라 문자열을 양쪽에 적지 않게 상수로 둔다.
 */
export const GROUP_MARKER_ATTR = "data-group-marker";

/** 분봉의 몫: 시각=number(unix초)·y좌표→가격은 %→base 환산·선 판정은 linePct(% 축)·▼ 마커 비켜주기. */
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
    useCandleInteraction<number>({
        chartRef,
        containerRef,
        lines: args.lines,
        resolveTime: (t) => (typeof t === "number" ? t : null),
        // 무장 좌클릭 — %축 y좌표 → base×(1+%/100). 분모(base) 없으면 캡처 없음.
        priceOfY: (y) => {
            const b = args.base;
            if (!b || b <= 0) return null;
            const pct = candleRef.current?.coordinateToPrice(y);
            return pct == null ? null : b * (1 + (pct as number) / 100);
        },
        // 우클릭 선 판정 — 환산만 렌더와 같은 linePct(% 축). 분모 없는 선은 화면에도 판정에도 없다.
        lineYOf: (line) => {
            const pct = linePct(line, args.base, args.pctBase);
            if (pct === null) return null;
            const ly = candleRef.current?.priceToCoordinate(pct);
            return ly == null ? null : (ly as number);
        },
        escapeSelector: `[${GROUP_MARKER_ATTR}]`,
        // 분봉 → 그 시각으로 타점 이동(실제 봉일 때만 — 조회 맵이 검증).
        onPrimaryAction: (t) => {
            const p = pointMapRef.current.get(t);
            if (p) args.onMovePoint(p.tradeTime);
        },
        onRightClickAt: (t, at) => {
            const p = pointMapRef.current.get(t);
            if (p) args.onRightClick({ date: p.date, time: p.tradeTime }, at);
        },
        onRemoveLine: args.onRemoveLine,
        onLineContext: args.onLineContext,
        onPickPrice: args.onPickPrice,
        captureArmed: args.captureArmed,
    });
}
