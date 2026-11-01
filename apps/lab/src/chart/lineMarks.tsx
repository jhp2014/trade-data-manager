// 선의 상단 표식 — 선을 만든 봉 위(차트 꼭대기)에 작은 칩, 칩에서 선 가격까지 점선 드롭선(workbench 앵커 표식의 결). 일봉·분봉 공용.
// 가격선의 축 라벨은 가격만 보이고, "어느 봉의 무엇인가"는 이 칩이 말한다(라벨 옆 글자는 가격 라벨을 가려 보기 안 좋다).
// 칩 = 상자 없는 날짜 글자(12px, 차트 위에서 읽히게 바탕색 테두리) + 그 아래 **점 두 칸** — 왼쪽 = 토큰(임시, 초록) · 오른쪽 = 저장(먹색),
// 찬 점 = 켜짐 · 빈 원 = 꺼짐. **점이 곧 버튼**: 누르면 그 채널만 켜고 끈다(둘 다 꺼지면 선이 사라진다). 날짜 글자는 카드만 띄운다.
// 칩 위 우클릭은 봉 우클릭(선 긋기)으로 새지 않게 막기만 한다. 그림 상자 밖 봉은 가장자리 ◀▶ 칩 — 누르면 그 봉으로.
// 칩은 한 줄 — 겹치면 겹친 채로 두고 **커서(십자선)에 가장 가까운 칩이 앞**(바탕을 깔아 글자가 섞이지 않게). 칩 위에 올라가 있는 동안은
// 그 칩이 앞을 붙잡는다(겹친 칩 위에서 조금 움직여도 누르려던 칩이 뒤로 숨지 않게).
// 칩 글자는 날짜(일봉 선 「01/07」 — 해는 시간축에 보인다 · 분봉 선 「09:44」)뿐 — 값(OHLC)·시장·거리는 칩에 올리면 뜨는 한 줄 카드(브라우저 툴팁 말고 앱 안 카드).
// % 는 카드에 없다 — 가로선 축 옆에 이미 있다.
// SVG 오버레이: 상자는 pointerEvents none, 칩만 all — 팬·크로스헤어·봉 우클릭 같은 차트 손짓을 가리지 않는다.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, Time } from "lightweight-charts";
import { lineColorOf, SAVED_LINE_COLOR, TEMP_LINE_COLOR, type LineKind } from "./priceLevels.js";
import type { ChipChannel } from "./lineSets.js";

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

export const CHIP_W = 36;
const CHIP_H = 25;
const CHIP_Y = 4;
/** 점 두 칸 — 지름 6.4, 칩 가운데에서 좌우로 DOT_DX, 누르는 범위는 점마다 HIT 정사각. */
const DOT_R = 3.2;
const DOT_DX = 5;
const DOT_Y = 19;
const HIT = 11;
/** 글자를 차트 위에서 읽히게 — 바탕색 테두리(halo)를 글자 뒤에. */
const HALO = { paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round" } as const;

export interface PlacedMark {
    mark: LineMark;
    x: number;
    /** 칩 윗변 y(한 줄 — 늘 같다). */
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
 * 칩은 x 순, 한 줄 — 겹쳐도 비키지 않는다(앞에 올 칩은 frontKey 가 고른다).
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
    for (const { mark, x } of inView) out.inView.push({ mark, x, chipY: CHIP_Y, y: yOf(mark) });
    return out;
}

/** 앞에 올 칩 — 붙잡은 칩(커서가 올라가 있는 칩)이 있으면 그것, 아니면 커서 x 에 가장 가까운 칩. 커서를 아직 안 움직였으면 가장 오른쪽(최근). */
export function frontKey(inView: readonly PlacedMark[], cursorX: number | null, held: string | null): string | null {
    if (held !== null && inView.some((p) => p.mark.key === held)) return held;
    if (inView.length === 0) return null;
    if (cursorX === null) return inView[inView.length - 1].mark.key;
    return inView.reduce((a, p) => (Math.abs(p.x - cursorX) < Math.abs(a.x - cursorX) ? p : a)).mark.key;
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
    onToggle,
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
    /** 점 클릭 — 그 채널(왼쪽 = 토큰, 오른쪽 = 저장)을 켜고 끈다. */
    onToggle: (mark: LineMark, channel: ChipChannel) => void;
}): JSX.Element | null {
    const { width, inView, offLeft, offRight } = useLineMarkLayout(chartRef, candleRef, marks, gen, dataKey);
    const [hover, setHover] = useState<{ key: string | null; x: number; y: number; info: LineInfo } | null>(null);
    // 선이 바뀌면(점으로 지움 등) 칩이 마우스를 떠나지 않고 사라질 수 있다 — 떠 있던 카드를 걷는다
    useEffect(() => setHover(null), [marks]);
    const cursorX = useCursorX(chartRef, gen);
    if (inView.length === 0 && offLeft.length === 0 && offRight.length === 0) return null;
    const hoverOn = (key: string | null, x: number, y: number, info: LineInfo) => ({ onMouseEnter: () => setHover({ key, x, y, info }), onMouseLeave: () => setHover(null) });
    const front = frontKey(inView, cursorX, hover?.key ?? null);
    const frontAt = inView.find((p) => p.mark.key === front);
    const frontCovers = !!frontAt && inView.some((p) => p !== frontAt && Math.abs(p.x - frontAt.x) < CHIP_W);
    // 앞 칩을 맨 나중에 그린다(SVG 는 나중 것이 위)
    const ordered = frontAt ? [...inView.filter((p) => p !== frontAt), frontAt] : inView;
    const color = SAVED_LINE_COLOR; // ◀▶ 은 어느 종류든 묶음이라 중립(먹색)
    const edge = (side: "left" | "right", items: LineMark[]) => {
        const x = side === "left" ? 2 + CHIP_W / 2 : width - 2 - CHIP_W / 2;
        return (
            <g
                key={side}
                style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={() => onGoTo(edgeTarget(side, items))}
                {...hoverOn(null, x, CHIP_Y, { head: `창 밖 선 ${items.length}개`, list: items.map((m) => m.info.head), hint: "클릭 그리로 이동" })}
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
            {ordered.map(({ mark, x, y, chipY }) => {
                const c = lineColorOf(mark.kind);
                const saved = mark.kind !== "temp";
                const temp = mark.kind !== "saved";
                const dot = (on: boolean, color: string, cx: number) => (
                    <circle cx={cx} cy={chipY + DOT_Y} r={DOT_R} fill={on ? color : "var(--surface)"} stroke={on ? color : "var(--text-3)"} strokeWidth={on ? 0 : 1} />
                );
                const hit = (channel: ChipChannel, cx: number) => (
                    <rect
                        data-chip-dot={channel}
                        x={cx - HIT / 2} y={chipY + DOT_Y - HIT / 2} width={HIT} height={HIT} fill="transparent" style={{ cursor: "pointer" }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle(mark, channel);
                        }}
                    />
                );
                return (
                    <g key={mark.key}>
                        {y !== null && y > chipY + CHIP_H && <line x1={x} x2={x} y1={chipY + CHIP_H} y2={y} stroke={c} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />}
                        <g
                            data-chip={mark.key}
                            style={{ pointerEvents: "all" }}
                            {...hoverOn(mark.key, x, chipY, mark.info)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation(); // 봉 우클릭(선 긋기)으로 새지 않게 — 칩 우클릭엔 기능이 없다
                            }}
                        >
                            <rect
                                x={x - CHIP_W / 2 - 3} y={chipY} width={CHIP_W + 6} height={CHIP_H} rx={3}
                                fill={mark.key === front && frontCovers ? "var(--surface)" : "transparent"} fillOpacity={0.94}
                            />
                            <text className="tabular" x={x} y={chipY + 12} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: "var(--text)", ...HALO }}>
                                {mark.short}
                            </text>
                            {dot(temp, TEMP_LINE_COLOR, x - DOT_DX)}
                            {dot(saved, SAVED_LINE_COLOR, x + DOT_DX)}
                            {hit("temp", x - DOT_DX)}
                            {hit("saved", x + DOT_DX)}
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

/** 십자선의 x(그림 상자 좌표) — 커서가 차트를 떠나면 마지막 값을 쥔다(앞 칩이 겹친 채 흐트러지지 않게). 앞에 올 칩을 고르는 데 쓴다. */
function useCursorX(chartRef: RefObject<IChartApi | null>, gen: number): number | null {
    const [x, setX] = useState<number | null>(null);
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const on = (p: MouseEventParams): void => {
            if (p.point) setX(p.point.x);
        };
        chart.subscribeCrosshairMove(on);
        return () => chart.unsubscribeCrosshairMove(on);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gen]);
    return x;
}

/**
 * 칩 카드 — 칩 옆(같은 높이), 차트에서 남은 공간이 넓은 쪽(칩이 오른쪽 반이면 왼쪽에) — 아래에 두면 커서에 가린다.
 * 폭은 글 길이대로. y = 칩 윗변. 손짓을 가리지 않게 pointerEvents none.
 */
function ChipCard({ x, y, info, width }: { x: number; y: number; info: LineInfo; width: number }): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(0);
    useLayoutEffect(() => setW(ref.current?.offsetWidth ?? 0), [info]);
    const gap = CHIP_W / 2 + 4;
    const left = x > width / 2 ? Math.max(4, x - gap - w) : Math.min(width - w - 4, x + gap);
    return (
        <div
            ref={ref}
            data-layer="chip-card"
            className="tabular"
            style={{
                position: "absolute", left, top: y - 3, zIndex: 6, pointerEvents: "none", boxSizing: "border-box",
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
