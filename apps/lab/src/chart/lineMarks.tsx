// 선의 상단 표식 — 선을 만든 봉 위(차트 꼭대기)에 작은 칩, 칩에서 선 가격까지 점선 드롭선(workbench 앵커 표식의 결). 일봉·분봉 공용.
// 가격선의 축 라벨은 가격만 보이고, "어느 봉의 무엇인가"는 이 칩이 말한다(라벨 옆 글자는 가격 라벨을 가려 보기 안 좋다).
// 칩 = 상자 없는 글자(12px, 차트 위에서 읽히게 바탕색 테두리) — 종류는 두 채널로: **글자 색 = 임시인가**(초록 = 경로에 있다, 먹색 = 저장만),
// **책갈피 = 저장인가**. 임시만 = 초록 글자(누르면 저장) · 저장만 = 책갈피 + 먹색 글자(누르면 임시로 가져옴) · 둘 다 = 책갈피 + 초록 글자.
// 칩 위 우클릭 = 한 겹 걷기(임시만 → 임시 지움, 저장된 것 → 저장에서 지움). 그림 상자 밖 봉은 가장자리 ◀▶ 칩 — 누르면 그 봉으로.
// 칩 글자는 날짜(일봉 선 「01/07」 — 해는 시간축에 보인다 · 분봉 선 「09:44」)뿐 — 값(OHLC)·시장·거리는 칩에 올리면 뜨는 한 줄 카드(브라우저 툴팁 말고 앱 안 카드).
// % 는 카드에 없다 — 가로선 축 옆에 이미 있다.
// SVG 오버레이: 상자는 pointerEvents none, 칩만 all — 팬·크로스헤어·봉 우클릭 같은 차트 손짓을 가리지 않는다.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { lineColorOf, SAVED_LINE_COLOR, TEMP_LINE_COLOR, type LineKind } from "./priceLevels.js";

export interface LineMark {
    key: string;
    /** 선 봉의 차트 시각 — 일봉 = 날짜 문자열, 분봉 = unix 초(같은 차트 안에선 한 가지라 크기 비교가 된다). */
    time: string | number;
    /** 그 차트 축 단위의 값. */
    price: number;
    kind: LineKind;
    /** 칩 글자 — 선 봉의 날짜("01/07")·분봉 선은 시각("09:44"). */
    short: string;
    /** 칩에 올리면 뜨는 카드의 내용. */
    info: LineInfo;
    /** 가로선 위 축 옆 글자(일봉 선 = 전날 종가 대비 %). */
    note?: string;
}

/** 칩 카드 — 한 줄(「H · UN* · 1거래일 전」 — 날짜는 칩에 있다). 묶음 카드(◀▶)는 list 로 선들을 늘어놓고 hint 로 손짓을 단다. */
export interface LineInfo {
    head: string;
    list?: readonly string[];
    hint?: string;
}

export const CHIP_W = 46;
const CHIP_H = 15;
const CHIP_Y = 4;
/** 칩 글자 폭(5글자 「05/11」·「09:44」, 12px 고정폭 숫자) · 책갈피 칸(아이콘 + 틈). */
const TEXT_W = 32;
const MARK_W = 11;
/** 글자를 차트 위에서 읽히게 — 바탕색 테두리(halo)를 글자 뒤에. */
const HALO = { paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round" } as const;

/** 책갈피 — 저장된 선의 표시(칩 글자 앞). (x, y) = 왼쪽 위. */
function Bookmark({ x, y }: { x: number; y: number }): JSX.Element {
    return <path d={`M${x} ${y} h8 v12 l-4 -3 l-4 3 z`} fill={SAVED_LINE_COLOR} stroke="var(--surface)" strokeWidth={1} strokeLinejoin="round" />;
}

/** 칩 줄 간격 — 가까운 봉의 칩은 아랫줄로 비켜 선다. */
export const CHIP_ROW_H = 17;

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
    const [hover, setHover] = useState<{ x: number; y: number; info: LineInfo } | null>(null);
    if (inView.length === 0 && offLeft.length === 0 && offRight.length === 0) return null;
    const hoverOn = (x: number, y: number, info: LineInfo) => ({ onMouseEnter: () => setHover({ x, y, info }), onMouseLeave: () => setHover(null) });
    const color = SAVED_LINE_COLOR; // ◀▶ 은 어느 종류든 묶음이라 중립(먹색)
    const edge = (side: "left" | "right", items: LineMark[]) => {
        const x = side === "left" ? 2 + CHIP_W / 2 : width - 2 - CHIP_W / 2;
        return (
            <g
                key={side}
                style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={() => onGoTo(edgeTarget(side, items))}
                {...hoverOn(x, CHIP_Y + CHIP_H, { head: `창 밖 선 ${items.length}개`, list: items.map((m) => m.info.head), hint: "클릭 그리로 이동" })}
            >
                <rect x={x - CHIP_W / 2} y={CHIP_Y} width={CHIP_W} height={CHIP_H} fill="transparent" />
                <text x={x} y={CHIP_Y + 12} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: color, ...HALO }}>
                    {side === "left" ? `◀${items.length > 1 ? items.length : ""}` : `${items.length > 1 ? items.length : ""}▶`}
                </text>
            </g>
        );
    };
    return (
        <>
        <svg data-layer="line-marks" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 4, pointerEvents: "none", overflow: "visible" }}>
            {inView.map(({ mark, x, y, chipY }) => {
                const c = lineColorOf(mark.kind);
                const saved = mark.kind !== "temp"; // 책갈피
                const temp = mark.kind !== "saved"; // 초록 글자
                const left = x - (TEXT_W + (saved ? MARK_W : 0)) / 2;
                return (
                    <g key={mark.key}>
                        {y !== null && y > chipY + CHIP_H && <line x1={x} x2={x} y1={chipY + CHIP_H} y2={y} stroke={c} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />}
                        <g
                            style={{ pointerEvents: "all", cursor: mark.kind === "both" ? "default" : "pointer" }}
                            onClick={() => onClick(mark)}
                            {...hoverOn(x, chipY + CHIP_H, mark.info)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation(); // 봉 우클릭(선 긋기)으로 새지 않게
                                onRemove(mark);
                            }}
                        >
                            <rect x={x - CHIP_W / 2} y={chipY} width={CHIP_W} height={CHIP_H} fill="transparent" />
                            {saved && <Bookmark x={left} y={chipY + 1.5} />}
                            <text
                                className="tabular"
                                x={left + (saved ? MARK_W : 0)} y={chipY + 12}
                                style={{ fontSize: 12, fontWeight: 600, fill: temp ? TEMP_LINE_COLOR : SAVED_LINE_COLOR, ...HALO }}
                            >
                                {mark.short}
                            </text>
                        </g>
                    </g>
                );
            })}
            {offLeft.length > 0 && edge("left", offLeft)}
            {offRight.length > 0 && edge("right", offRight)}
        </svg>
        {hover && <ChipCard {...hover} width={width} />}
        </>
    );
}

const CARD_MUTED: CSSProperties = { color: "var(--text-3)", fontSize: 11 };

/** 칩 카드 — 칩 바로 아래(가운데 맞춤 — 폭은 글 길이대로, 차트 밖으로는 안 나가게). 손짓을 가리지 않게 pointerEvents none. */
function ChipCard({ x, y, info, width }: { x: number; y: number; info: LineInfo; width: number }): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(0);
    useLayoutEffect(() => setW(ref.current?.offsetWidth ?? 0), [info]);
    const left = Math.max(4, Math.min(x - w / 2, width - w - 4));
    return (
        <div
            ref={ref}
            data-layer="chip-card"
            className="tabular"
            style={{
                position: "absolute", left, top: y + 4, zIndex: 6, pointerEvents: "none", boxSizing: "border-box",
                padding: "3px 8px", fontSize: 12, lineHeight: 1.45, background: "var(--surface)", color: "var(--text)", whiteSpace: "nowrap",
                border: "1px solid var(--border)", borderRadius: 5, boxShadow: "0 3px 10px rgba(0,0,0,0.14)", visibility: w ? "visible" : "hidden",
            }}
        >
            <div style={{ fontWeight: 600 }}>{info.head}</div>
            {info.list?.map((t, i) => (
                <div key={i} style={{ fontSize: 11.5 }}>{t}</div>
            ))}
            {info.hint && <div style={CARD_MUTED}>{info.hint}</div>}
        </div>
    );
}
