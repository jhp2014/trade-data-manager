// 선의 상단 표식 — 선을 만든 봉 위(차트 꼭대기)에 작은 칩, 칩에서 선 가격까지 점선 드롭선(workbench 앵커 표식의 결). 일봉·분봉 공용.
// 가격선의 축 라벨은 가격만 보이고, "어느 봉의 무엇인가"는 이 칩이 말한다(라벨 옆 글자는 가격 라벨을 가려 보기 안 좋다).
// 칩 모양 = 선의 종류, 두 채널로(priceLevels 머리 주석) — 채움 = 저장, 테두리 = 임시:
// 임시만 = 빈 칩 + 초록 테두리(누르면 저장) · 저장만 = 먹색 채움(누르면 임시로 가져옴) · 둘 다 = 먹색 채움 + 굵은 초록 고리.
// 칩 위 우클릭 = 한 겹 걷기(임시만 → 임시 지움, 저장된 것 → 저장에서 지움). 그림 상자 밖 봉은 가장자리 ◀▶ 칩 — 누르면 그 봉으로.
// SVG 오버레이: 상자는 pointerEvents none, 칩만 all — 팬·크로스헤어·봉 우클릭 같은 차트 손짓을 가리지 않는다.
import { useEffect, useState, type RefObject } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { lineColorOf, SAVED_LINE_COLOR, TEMP_LINE_COLOR, type LineKind } from "./priceLevels.js";

export interface LineMark {
    key: string;
    /** 선 봉의 차트 시각 — 일봉 = 날짜 문자열, 분봉 = unix 초(같은 차트 안에선 한 가지라 크기 비교가 된다). */
    time: string | number;
    /** 그 차트 축 단위의 값. */
    price: number;
    kind: LineKind;
    /** 칩 글자(짧게 — "H", "L·K"). */
    short: string;
    /** 칩 툴팁. */
    tip: string;
}

export const CHIP_W = 26;
const CHIP_H = 13;
const CHIP_Y = 4;
/** 칩 줄 간격 — 가까운 봉의 칩은 아랫줄로 비켜 선다. */
export const CHIP_ROW_H = 15;

export interface PlacedMark {
    mark: LineMark;
    x: number;
    /** 칩 윗변 y — 겹치면 아랫줄로. */
    chipY: number;
    /** 선 가격의 y — 캔들 pane 밖이면 null(드롭선 없음). */
    y: number | null;
}

export interface LineMarkLayout {
    width: number;
    inView: PlacedMark[];
    offLeft: LineMark[];
    offRight: LineMark[];
}

/**
 * 표식 → 자리(순수). 그림 상자(0~width) 안이면 칩, 밖이면 ◀▶ 묶음. 봉이 시리즈에 없으면(xOf null) 버린다.
 * 칩은 x 순으로 놓고, 앞 칩과 칩 폭보다 가까우면 그 칩과 다른 줄로 내린다(같은 봉의 H·L 도 둘 다 보이게).
 */
export function layoutLineMarks(
    marks: readonly LineMark[],
    xOf: (m: LineMark) => number | null,
    yOf: (m: LineMark) => number | null,
    width: number,
): LineMarkLayout {
    const out: LineMarkLayout = { width, inView: [], offLeft: [], offRight: [] };
    const inView: { mark: LineMark; x: number }[] = [];
    for (const m of marks) {
        const x = xOf(m);
        if (x === null) continue;
        if (x < 0) out.offLeft.push(m);
        else if (x > width) out.offRight.push(m);
        else inView.push({ mark: m, x });
    }
    inView.sort((a, b) => a.x - b.x);
    const rowRight: number[] = []; // 줄마다 마지막 칩의 오른쪽 끝
    for (const { mark, x } of inView) {
        let row = rowRight.findIndex((r) => x - CHIP_W / 2 >= r + 1);
        if (row < 0) row = rowRight.length;
        rowRight[row] = x + CHIP_W / 2;
        out.inView.push({ mark, x, chipY: CHIP_Y + row * CHIP_ROW_H, y: yOf(mark) });
    }
    return out;
}

/** ◀ 칩이 데려갈 봉 = 왼쪽 밖에서 가장 가까운(가장 늦은) 봉 · ▶ = 오른쪽 밖에서 가장 이른 봉. */
export function edgeTarget(side: "left" | "right", items: readonly LineMark[]): string | number {
    return items.reduce<string | number>((a, m) => (side === "left" ? (m.time > a ? m.time : a) : m.time < a ? m.time : a), items[0].time);
}

/**
 * 차트가 바뀔 때마다 칩 자리를 다시 잰다 — 가로 범위·크기, 그리고 세로 스케일이 바뀌는 길(데이터 교체 = dataKey,
 * 가격 축 끌기·pane 경계 끌기 — 둘 다 커서가 움직이므로 크로스헤어 이벤트)까지. rAF 하나로 묶는다.
 */
function useLineMarkLayout(
    chartRef: RefObject<IChartApi | null>,
    candleRef: RefObject<ISeriesApi<"Candlestick"> | null>,
    marks: readonly LineMark[],
    gen: number,
    dataKey: unknown,
): LineMarkLayout {
    const [layout, setLayout] = useState<LineMarkLayout>({ width: 0, inView: [], offLeft: [], offRight: [] });
    useEffect(() => {
        const chart = chartRef.current;
        const candle = candleRef.current;
        if (!chart || !candle) return;
        let raf: number | null = null;
        const measure = (): void => {
            raf = null;
            const ts = chart.timeScale();
            const paneH = chart.panes()[0]?.getHeight() ?? Infinity;
            setLayout(
                layoutLineMarks(
                    marks,
                    (m) => ts.timeToCoordinate(m.time as Time), // 데이터에 있는 봉이면 화면 밖이어도 좌표(음수·폭 넘김)가 온다
                    (m) => {
                        const y = candle.priceToCoordinate(m.price);
                        return y !== null && y >= 0 && y <= paneH ? y : null;
                    },
                    ts.width(),
                ),
            );
        };
        const schedule = (): void => {
            if (raf === null) raf = requestAnimationFrame(measure);
        };
        schedule();
        chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
        chart.timeScale().subscribeSizeChange(schedule);
        chart.subscribeCrosshairMove(schedule);
        return () => {
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);
            chart.timeScale().unsubscribeSizeChange(schedule);
            chart.unsubscribeCrosshairMove(schedule);
            if (raf !== null) cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [marks, gen, dataKey]);
    return layout;
}

export function LineMarkLayer({
    chartRef,
    candleRef,
    marks,
    gen,
    dataKey,
    onGoTo,
    onClick,
    onRemove,
}: {
    chartRef: RefObject<IChartApi | null>;
    candleRef: RefObject<ISeriesApi<"Candlestick"> | null>;
    marks: readonly LineMark[];
    /** 시리즈 세대 — 다시 만들어지면 다시 잰다. */
    gen: number;
    /** 시리즈 데이터 정체(바뀌면 세로 스케일도 바뀐다 — 다시 잰다). */
    dataKey: unknown;
    /** ◀▶ 칩 — 그 방향 첫 표식의 봉으로 간다. */
    onGoTo: (time: string | number) => void;
    /** 칩 클릭 — 임시만 = 저장 · 저장만 = 임시로 가져옴(둘 다면 할 일 없음). */
    onClick: (mark: LineMark) => void;
    /** 칩 위 우클릭 — 한 겹 걷기(봉 우클릭과 달리 「우클릭 선」 설정과 상관없이 그 선). */
    onRemove: (mark: LineMark) => void;
}): JSX.Element | null {
    const { width, inView, offLeft, offRight } = useLineMarkLayout(chartRef, candleRef, marks, gen, dataKey);
    if (inView.length === 0 && offLeft.length === 0 && offRight.length === 0) return null;
    const color = SAVED_LINE_COLOR; // ◀▶ 은 어느 종류든 묶음이라 중립(먹색)
    const edge = (side: "left" | "right", items: LineMark[]) => {
        const x = side === "left" ? 2 + CHIP_W / 2 : width - 2 - CHIP_W / 2;
        return (
            <g key={side} style={{ pointerEvents: "all", cursor: "pointer" }} onClick={() => onGoTo(edgeTarget(side, items))}>
                <title>{`창 밖 선 ${items.length}개(누르면 그리로 이동)\n${items.map((m) => m.tip).join("\n")}`}</title>
                <rect x={x - CHIP_W / 2} y={CHIP_Y} width={CHIP_W} height={CHIP_H} rx={3} fill="var(--surface)" fillOpacity={0.92} stroke={color} strokeWidth={0.7} />
                <text x={x} y={CHIP_Y + 9.5} textAnchor="middle" style={{ fontSize: 8, fill: color }}>
                    {side === "left" ? `◀${items.length > 1 ? items.length : ""}` : `${items.length > 1 ? items.length : ""}▶`}
                </text>
            </g>
        );
    };
    return (
        <svg data-layer="line-marks" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 4, pointerEvents: "none", overflow: "visible" }}>
            {inView.map(({ mark, x, y, chipY }) => {
                const c = lineColorOf(mark.kind);
                const saved = mark.kind !== "temp"; // 채움
                const temp = mark.kind !== "saved"; // 테두리
                return (
                    <g key={mark.key}>
                        {y !== null && y > chipY + CHIP_H && <line x1={x} x2={x} y1={chipY + CHIP_H} y2={y} stroke={c} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />}
                        <g
                            style={{ pointerEvents: "all", cursor: mark.kind === "both" ? "default" : "pointer" }}
                            onClick={() => onClick(mark)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation(); // 봉 우클릭(선 긋기)으로 새지 않게
                                onRemove(mark);
                            }}
                        >
                            <title>{mark.tip}</title>
                            <rect
                                x={x - CHIP_W / 2} y={chipY} width={CHIP_W} height={CHIP_H} rx={3}
                                fill={saved ? SAVED_LINE_COLOR : "var(--surface)"}
                                stroke={temp ? TEMP_LINE_COLOR : "none"} strokeWidth={saved ? 2 : 1.2}
                            />
                            <text x={x} y={chipY + 9.5} textAnchor="middle" style={{ fontSize: 8, fill: saved ? "#fff" : TEMP_LINE_COLOR, fontWeight: 700 }}>
                                {mark.short}
                            </text>
                        </g>
                    </g>
                );
            })}
            {offLeft.length > 0 && edge("left", offLeft)}
            {offRight.length > 0 && edge("right", offRight)}
        </svg>
    );
}
