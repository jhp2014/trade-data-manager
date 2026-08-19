// 캔들차트 마우스 상호작용의 공통 정책 — 일봉/분봉 훅이 같은 골조(크로스헤어 hover 추적 →
// 무장 좌클릭 캡처 → ctrl+클릭/더블클릭 주행동 → 우클릭 선 판정/hover 봉 폴백)를 각자 복제하고
// 있었다. 정책(무장 중 클릭은 캡처 전용·더블클릭=ctrl+클릭 동등·선 근처 우클릭이 hover 폴백보다
// 우선)은 **여기 한 곳에만** 있고, 차트별 차이는 네 가지 주입으로 남는다:
//   · resolveTime — param.time 판별(일봉 string 날짜 / 분봉 number unix초)
//   · priceOfY — 무장 좌클릭 y좌표 → 가격(일봉 raw / 분봉 %→base 환산; 분모 없으면 null=캡처 없음)
//   · lineYOf — 선 → 컨테이너 y좌표(일봉 raw / 분봉 linePct % 환산; null=안 그려진 선, 판정 제외)
//   · escapeSelector — 우클릭이 비켜줄 대상(분봉 타점 ▼ 마커)
// 시각→콜백 payload 변환(일봉 날짜 / 분봉 {date,time})은 각 어댑터의 onPrimaryAction/onRightClickAt 몫.
import { useEffect, useRef, type RefObject } from "react";
import { type IChartApi } from "lightweight-charts";
import { isModifiedClick, type ChartClickParam } from "./chartShell.js";
import { findLineNearY } from "./candleAmountSeries.js";
import { useLatest } from "../lib/useLatest.js";
import type { RenderLine } from "../lib/chartFrame.js";

const LINE_HIT_PX = 6; // 우클릭이 "이 선을 지운다"로 해석되는 세로 허용 오차(일봉·분봉 공통)

export interface CandleInteractionArgs<T extends string | number> {
    chartRef: RefObject<IChartApi | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    lines: RenderLine[]; // 우클릭 라벨-삭제 매칭용(현재 선 데이터)
    /** param.time → 이 차트의 시각 타입. 다른 타입(빈 영역·다른 축)이면 null. */
    resolveTime: (time: unknown) => T | null;
    /** 무장 좌클릭: pane0 y좌표 → 가격. null 이면 캡처하지 않는다(분모/시리즈 없음). */
    priceOfY: (y: number) => number | null;
    /** 우클릭 선 판정: 선 → 컨테이너 y좌표. null 이면 판정 제외(화면에 없는 선은 판정에도 없다). */
    lineYOf: (line: RenderLine) => number | null;
    /** 우클릭이 비켜줄 CSS 선택자 — e.target 이 매치되면 아무것도 하지 않는다(그 UI 의 몫). */
    escapeSelector?: string;
    /** ctrl+클릭/더블클릭 주행동 — 일봉 날짜검색, 분봉 타점이동. */
    onPrimaryAction: (time: T) => void;
    /** 선 판정에 안 걸린 우클릭 — hover 중이던 봉 시각으로 콜백(payload 변환은 어댑터가). */
    onRightClickAt: (time: T, at: { x: number; y: number }) => void;
    onRemoveLine: (line: RenderLine) => void;
    /** 있으면 선 근처 우클릭이 즉시 삭제 대신 이 콜백(메뉴 열기)으로 간다 — 복기 패널이 쓰고 실시간은 즉시 삭제 유지. */
    onLineContext?: (line: RenderLine, at: { x: number; y: number }) => void;
    onPickPrice?: (price: number) => void; // 무장 시 좌클릭 y좌표 → 가격 캡처
    captureArmed?: boolean;
}

/**
 * 마우스 상호작용 — hover 추적 · 클릭(주행동/가격캡처) · 더블클릭 · 우클릭(선 삭제/봉 컨텍스트).
 * 구독은 마운트 1회만 하고, 콜백·무장상태·주입 함수는 매 렌더 ref 로 최신화한다(재구독 없이 최신 클로저).
 */
export function useCandleInteraction<T extends string | number>(args: CandleInteractionArgs<T>): void {
    const { chartRef, containerRef } = args;
    const hoveredTimeRef = useRef<T | null>(null);
    const cb = useLatest(args);

    useEffect(() => {
        const chart = chartRef.current;
        const el = containerRef.current;
        if (!chart || !el) return;
        const onMove = (param: { time?: unknown }): void => {
            hoveredTimeRef.current = cb.current.resolveTime(param.time);
        };
        chart.subscribeCrosshairMove(onMove);
        // 주행동 — 클릭된 봉 시각이 이 차트의 것일 때만(빈 영역이면 resolveTime 이 null).
        const primaryAt = (param: ChartClickParam): void => {
            const t = cb.current.resolveTime(param.time);
            if (t != null) cb.current.onPrimaryAction(t);
        };
        // 무장(가격 편집 중) 시 좌클릭 = 그 y좌표 가격을 캡처(캔들 pane0만) — 주행동 억제.
        // 아니면 ctrl+클릭만 주행동(맨 좌클릭은 팬 몫).
        const onClick = (param: ChartClickParam): void => {
            if (cb.current.captureArmed) {
                if (cb.current.onPickPrice && param.point && (param.paneIndex ?? 0) === 0) {
                    const price = cb.current.priceOfY(param.point.y);
                    if (price != null) cb.current.onPickPrice(price);
                }
                return; // 무장 중엔 클릭이 캡처 전용
            }
            if (isModifiedClick(param)) primaryAt(param);
        };
        // 더블클릭 = ctrl+클릭과 동등. 무장 중엔 캡처가 클릭을 독점하므로 주행동으로 새지 않게 막는다.
        const onDblClick = (param: ChartClickParam): void => {
            if (!cb.current.captureArmed) primaryAt(param);
        };
        chart.subscribeClick(onClick);
        chart.subscribeDblClick(onDblClick);
        const onCtx = (e: MouseEvent): void => {
            e.preventDefault();
            // 비켜줄 대상(분봉 타점 ▼ 마커) 위 우클릭은 그 UI 의 몫.
            // (마커는 이 컨테이너의 자식이라 네이티브 버블이 여기를 **먼저** 지난다. React 쪽 stopPropagation 은
            //  루트 위임이라 이 리스너보다 늦게 돌아 못 막는다 → 목표를 보고 판단하는 이 방식이 유일하게 확실하다.)
            const esc = cb.current.escapeSelector;
            if (esc && (e.target as Element | null)?.closest?.(esc)) return;
            const y = e.clientY - el.getBoundingClientRect().top;
            // 1) 기존 선(라벨/선) 근처 우클릭 → 그 선 삭제/메뉴(봉을 일일이 찾을 필요 없음). 환산은 lineYOf 주입.
            //    알람선(kind A — 규칙/draft 소유)은 판정에서 뺀다: 우클릭 삭제 대상이 아닌데 ±6px 을
            //    가로채면 그 근처의 D/M 선 토글이 소리 없이 막힌다.
            const hit = findLineNearY(cb.current.lines.filter((l) => l.kind !== "A"), y, LINE_HIT_PX, (line) => cb.current.lineYOf(line));
            if (hit) {
                if (cb.current.onLineContext) cb.current.onLineContext(hit, { x: e.clientX, y: e.clientY });
                else cb.current.onRemoveLine(hit);
                return;
            }
            // 2) 아니면 hover 중인 봉 컨텍스트 — 복기는 메뉴(가격선·파라미터 지정), 실시간은 고가 선 토글.
            const t = hoveredTimeRef.current;
            if (t != null) cb.current.onRightClickAt(t, { x: e.clientX, y: e.clientY });
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
