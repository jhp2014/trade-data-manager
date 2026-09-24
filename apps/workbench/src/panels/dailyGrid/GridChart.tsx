// 격자판 차트 — 하루 전체 캔들 위에 밴드 계단·사슬 띠·후보 ▼, 아래에 사슬 필터 레인, 위에 하루 길잡이 띠.
// 손짓은 **직접 그린 캔버스** 위의 투명 층이 받는다(decisions 「Daily 타점 생성 = 돌파 사슬」 — lightweight-charts
// 는 레인 동기화·세로 띠·수명 함정 비용이, d3-zoom 은 mousedown 을 삼키는 선례가 있어 기각).
//   휠 = 커서 기준 가로 확대(가로 휠·Shift+휠 = 이동) · 드래그 = 이동 · 더블클릭 = 하루 전체 · 클릭 = 그 봉으로 시각 이동
//   세로는 보이는 구간에 자동 맞춤. 길잡이 띠: 클릭 = 그 자리로 창 옮기기, 끌기 = 창 이동.
//
// ⚠ 휠은 React onWheel 로 못 막는다(패시브 리스너라 preventDefault 가 무시되고 판 스크롤이 같이 굴러간다) —
//   네이티브 리스너를 passive:false 로 건다.
import { useEffect, useMemo, useRef, useState } from "react";
import { minuteOfDayOf, type BreakoutChainResult, type ChainCheck, type ChainFilter, type BreakoutLabelFilter, type ChainVerdict } from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { CanvasLayers } from "../canvas/CanvasPainter.js";
import { CHAIN_FAIL, CHAIN_PASS } from "../../styles/palette.js";
import { CHECK_NAME, checkRuleText, checkValueText } from "./chainChecks.js";
import { LANE_MIN_BW, LANE_ROW_H, gridLayers, labelColor, laneLayers, navLayers, viewRangeOf, xScaleOf, type GridBox, type GridSpan } from "./gridLayers.js";
import { WHEEL_ZOOM, centerAt, panBy, wholeSpan, zoomAt } from "./viewport.js";

const PAD_X = 6;
const NAV_H = 22;
/** 클릭을 미루는 더블클릭 창(ms). */
const DBL_MS = 250;

export interface GridChartProps {
    stock: ReplayStock;
    res: BreakoutChainResult & { baselinePct: number | null };
    verdicts: readonly ChainVerdict[];
    checks: readonly ChainCheck[];
    filter: ChainFilter;
    label: BreakoutLabelFilter;
    span: GridSpan;
    onSpan: (sp: GridSpan) => void;
    focusIdx: number | null;
    onPickBar: (i: number) => void;
}

const hm = (unix: number): string => {
    const m = minuteOfDayOf(unix);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function GridChart(props: GridChartProps): JSX.Element {
    const { stock: s, res, verdicts, checks, span, onSpan, focusIdx, onPickBar } = props;
    const n = s.times.length;
    const mainRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => setSize({ w: es[0].contentRect.width, h: es[0].contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const laneH = (checks.length + 1) * LANE_ROW_H;
    const laneBox: GridBox = { left: PAD_X, top: Math.max(0, size.h - laneH - 4), width: Math.max(0, size.w - 2 * PAD_X), height: laneH };
    const chartBox: GridBox = { left: PAD_X, top: 4, width: laneBox.width, height: Math.max(0, laneBox.top - 10) };
    const navBox: GridBox = { left: PAD_X, top: 2, width: laneBox.width, height: NAV_H - 4 };
    const xs = xScaleOf(span, chartBox, n);
    const clip = useMemo(() => ({ left: PAD_X, top: 0, width: laneBox.width, height: size.h }), [laneBox.width, size.h]);

    const verdictAt = useMemo(() => {
        const m = new Map<number, ChainVerdict>();
        for (const v of verdicts) m.set(v.bar.i, v);
        return m;
    }, [verdicts]);

    const layers = useMemo(() => {
        if (chartBox.width <= 0 || chartBox.height <= 0) return null;
        const range = viewRangeOf(s, xs.first, xs.last, res.baselinePct);
        if (!range) return null;
        return [
            ...gridLayers(s, res, verdicts, { ...span, ...range }, chartBox, focusIdx),
            ...laneLayers(verdicts, checks, span, laneBox, n),
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [s, res, verdicts, checks, span.x0, span.x1, size.w, size.h, focusIdx]);
    const nav = useMemo(
        () => navLayers(s, res, verdicts, span, navBox),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [s, res, verdicts, span.x0, span.x1, size.w],
    );

    // ── 손짓 — 최신 값을 ref 로(창 리스너가 옛 클로저를 붙잡지 않게).
    const live = useRef({ span, xs, n, onSpan });
    live.current = { span, xs, n, onSpan };

    useEffect(() => {
        const el = overlayRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent): void => {
            e.preventDefault();
            setHover(null); // 창이 바뀌면 커서 아래 봉도 바뀐다 — 옛 봉 설명을 남기지 않는다(다음 mousemove 가 다시 잡는다)
            const { span: sp, xs: x, n: nn, onSpan: set } = live.current;
            const rect = el.getBoundingClientRect();
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
                const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / x.bw;
                set(panBy(sp, d, nn));
                return;
            }
            const anchor = sp.x0 + (e.clientX - rect.left - PAD_X) / x.bw;
            set(zoomAt(sp, anchor, e.deltaY > 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM, nn));
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    const clickTimer = useRef<number | null>(null);
    useEffect(() => () => { if (clickTimer.current !== null) window.clearTimeout(clickTimer.current); }, []);
    const resetWhole = (): void => {
        if (clickTimer.current !== null) { window.clearTimeout(clickTimer.current); clickTimer.current = null; }
        onSpan(wholeSpan(n));
    };

    const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
    const [dragging, setDragging] = useState(false);

    const onMouseDown = (e: React.MouseEvent): void => {
        if (e.button !== 0) return;
        const el = overlayRef.current!;
        const rect = el.getBoundingClientRect();
        const start = { x: e.clientX, span: live.current.span, bw: live.current.xs.bw };
        let moved = false;
        const move = (ev: MouseEvent): void => {
            const dx = ev.clientX - start.x;
            if (!moved && Math.abs(dx) > 3) { moved = true; setDragging(true); setHover(null); }
            if (moved) live.current.onSpan(panBy(start.span, -dx / start.bw, live.current.n));
        };
        const up = (ev: MouseEvent): void => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            setDragging(false);
            if (moved) return;
            const i = live.current.xs.idxAt(ev.clientX - rect.left);
            if (i < 0 || i >= live.current.n) return;
            // 클릭은 더블클릭 창만큼 미룬다 — 더블클릭(하루 전체)의 첫 클릭이 포커스 시각을 옮기면 안 된다.
            if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
            clickTimer.current = window.setTimeout(() => { clickTimer.current = null; onPickBar(i); }, DBL_MS);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    };

    const onNavDown = (e: React.MouseEvent<HTMLDivElement>): void => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const wholeBw = navBox.width / Math.max(1, n);
        const idxOf = (cx: number): number => (cx - rect.left - PAD_X) / wholeBw;
        const inside = (() => { const c = idxOf(e.clientX); return c >= span.x0 && c <= span.x1; })();
        // 창 밖을 누르면 그 자리로 옮기고, 창 안을 누르면 그대로 끈다.
        const base = inside ? span : centerAt(span, idxOf(e.clientX), n);
        if (!inside) onSpan(base);
        const startX = e.clientX;
        const move = (ev: MouseEvent): void => live.current.onSpan(panBy(base, (ev.clientX - startX) / wholeBw, live.current.n));
        const up = (): void => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    };

    const lanesHidden = xs.bw < LANE_MIN_BW;
    const tip = hover !== null && hover.i >= 0 && hover.i < n ? hover : null;

    return (
        <div style={{ flex: 1, minHeight: 160, display: "flex", flexDirection: "column" }}>
            <div style={{ height: NAV_H, position: "relative", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)" }}
                onMouseDown={onNavDown} onDoubleClick={() => onSpan(wholeSpan(n))}
                title="하루 전체 — 사각형 = 지금 보는 창(끌어 이동 · 클릭 = 그 자리로 · 더블클릭 = 하루 전체)">
                <CanvasLayers layers={nav} width={size.w} height={NAV_H} clip={null} />
            </div>
            <div ref={mainRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {layers === null && size.w > 0 && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 11.5 }}>
                        이 구간에 거래가 없습니다
                    </div>
                )}
                {/* 가로로 자른다 — 반쯤 걸친 첫·끝 봉의 캔들·칸이 상자 밖(레인 이름표 자리)으로 삐지지 않게. */}
                {layers !== null && <CanvasLayers layers={layers} width={size.w} height={size.h} clip={clip} />}
                {lanesHidden && size.w > 0 && (
                    <div style={{ position: "absolute", left: PAD_X, top: laneBox.top, height: laneBox.height, display: "flex", alignItems: "center", fontSize: 10, color: "var(--text-tertiary)", pointerEvents: "none" }}>
                        사슬 필터 레인은 확대하면 보입니다(봉 폭 {xs.bw.toFixed(1)}px — {LANE_MIN_BW}px 이상에서) · 휠 = 확대 · 드래그 = 이동 · 더블클릭 = 하루 전체
                    </div>
                )}
                <div ref={overlayRef} data-testid="grid-overlay"
                    style={{ position: "absolute", inset: 0, cursor: dragging ? "grabbing" : "crosshair" }}
                    onMouseDown={onMouseDown}
                    onDoubleClick={resetWhole}
                    onMouseMove={(e) => {
                        if (dragging) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        setHover({ i: xs.idxAt(e.clientX - r.left), x: e.clientX - r.left, y: e.clientY - r.top });
                    }}
                    onMouseLeave={() => setHover(null)} />
                {tip && (
                    <BarTip {...props} i={tip.i} verdict={verdictAt.get(tip.i) ?? null}
                        style={{
                            position: "absolute", top: Math.min(tip.y + 12, Math.max(0, size.h - 150)),
                            ...(tip.x > size.w / 2 ? { right: size.w - tip.x + 12 } : { left: tip.x + 12 }),
                        }} />
                )}
            </div>
        </div>
    );
}

function BarTip({ stock: s, checks, filter, label, i, verdict, style }: GridChartProps & {
    i: number;
    verdict: ChainVerdict | null;
    style: React.CSSProperties;
}): JSX.Element {
    const tv = s.cumAmount[i] - (i > 0 ? s.cumAmount[i - 1] : 0);
    return (
        <div className="tabular" style={{
            ...style, pointerEvents: "none", zIndex: 5, background: "var(--bg-primary)", border: "1px solid var(--border-default)",
            borderRadius: 4, padding: "4px 7px", fontSize: 10.5, lineHeight: 1.45, boxShadow: "0 2px 6px rgba(0,0,0,0.15)", whiteSpace: "nowrap",
        }}>
            <div style={{ fontWeight: 600 }}>
                {hm(s.times[i])} · 종가 {s.rate[i].toFixed(2)}% · {(tv / 1e8).toFixed(1)}억
            </div>
            {!(tv > 0) && <div style={{ color: "var(--text-tertiary)" }}>거래 없음(채움봉)</div>}
            {tv > 0 && verdict === null && <div style={{ color: "var(--text-tertiary)" }}>사슬 밖</div>}
            {verdict !== null && (
                <>
                    <div style={{ color: labelColor(verdict.bar.label) }}>
                        사슬 {verdict.bar.chain + 1} · {verdict.bar.pos}봉째 · {verdict.bar.label === "baseline" ? "기준선 돌파" : "고가 돌파"}
                    </div>
                    {checks.map((c) => {
                        const bad = verdict.failed.includes(c);
                        return (
                            <div key={c}>
                                <span style={{ color: bad ? CHAIN_FAIL : CHAIN_PASS }}>{bad ? "✗" : "✓"}</span>{" "}
                                {CHECK_NAME[c]} {checkValueText(c, verdict.bar, s)}
                                <span style={{ color: "var(--text-tertiary)" }}> ({checkRuleText(c, filter, label)})</span>
                            </div>
                        );
                    })}
                    <div style={{ fontWeight: 600 }}>
                        {verdict.rank === null
                            ? "봉 조건 탈락"
                            : verdict.picked
                                ? `후보 ▼ — 통과 ${verdict.rank + 1}번째`
                                : `통과 ${verdict.rank + 1}번째 — 순번 밖(${filter.firstK === null ? "전부" : `처음 ${filter.firstK}개`})`}
                    </div>
                </>
            )}
        </div>
    );
}
