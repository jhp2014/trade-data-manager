// 테마 순위 평면의 공용 렌더 — 축/눈금/존 틴트(under SVG) + 캔버스(점·꼬리) + 포인터 층(over SVG:
// 컷/자 배지 드래그·팬·클릭 이동·휠 줌·호버 툴팁) + footer(타임라인·꼬리 설정).
//
// 판정의 유무는 **props 로만** 갈린다: `cut`(연동 조건판) 가 있으면 십자선 = 술어(FILTER 빨강·존 틴트),
// 없으면 십자선 = 자유 자(회색, panelUi "guides" — **상시**, 2026-09-17 "선은 항상 있다").
// 자의 기본 자리는 뷰 가운데(저장 전엔 파생 — 저장물 없이도 선이 선다).
import { useRef, useState } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { CanvasLayers } from "../canvas/CanvasPainter.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { FILTER } from "../../styles/palette.js";
import { panAmountDom, panRateDom, type ValueDom } from "./axisModel.js";
import { tooltipBoxOf } from "./tooltipBox.js";
import { TimelineBar } from "./TimelineBar.js";
import { TrailControl } from "./TrailControl.js";
import type { BandSegment } from "./zoneTrack.js";
import { CLICK_SLOP, LBL_H, LBL_PAD, LBL_W, ZOOM_MIN_SPAN, fmtHms, type ThemePlane } from "./useThemePlane.js";

/** 연동 조건판의 컷 모델 — 십자선이 곧 술어다(드래그 미리보기는 패널 소유, 커밋은 손 뗄 때 한 번). */
export interface CutModel {
    rateN: number;
    amountN: number;
    onPreview(patch: { zoneRateN?: number; zoneAmountN?: number }): void;
    onCommit(): void;
}

export function ThemePlaneView({ plane, cut, guideKeys, segments }: {
    plane: ThemePlane;
    /** null = 자유 자 모드(미연동 조건판·관찰판). */
    cut: CutModel | null;
    /** 자의 저장 키(x·y) — 판 종류가 키 규칙을 정한다(조건판은 창 포함, 관찰판은 모드만). */
    guideKeys: { x: string; y: string };
    /** 시선 종목의 존 재적 띠 — 연동 조건판만 준다. */
    segments: BandSegment[] | null;
}): JSX.Element | null {
    const { nameOf } = useStockNamesDict();
    const setTime = useWorkbench((s) => s.setTime);
    const p = plane;
    const { box, size, scales, xScale, yScale } = p;

    // ── 자유 자 — 상시(저장 전 기본 = 뷰 가운데 파생값). 드래그 미리보기는 로컬, 커밋은 손 뗄 때 한 번.
    const [guides, setGuides] = usePanelUi<Record<string, number>>(p.panelId, "guides", {});
    const [guidePrev, setGuidePrev] = useState<{ k: string; v: number } | null>(null);
    const centerX = xScale.invert(box.left + box.width / 2);
    const centerY = yScale.invert(box.top + box.height / 2);
    const gx = cut !== null ? null : guidePrev?.k === guideKeys.x ? guidePrev.v : guides[guideKeys.x] ?? centerX;
    const gy = cut !== null ? null : guidePrev?.k === guideKeys.y ? guidePrev.v : guides[guideKeys.y] ?? centerY;

    // ── 포인터 상태.
    const dragRef = useRef<"rate" | "amount" | "gx" | "gy" | null>(null);
    const downRef = useRef<{ x: number; y: number } | null>(null);
    const panRef = useRef<{ x: number; y: number; dom: { x0: number; x1: number; y0: number; y1: number }; vx: ValueDom; vy: ValueDom } | null>(null);
    const [hover, setHover] = useState<{ x: number; y: number; code: string; rate: number; amount: number } | null>(null);

    const cutX = cut !== null ? scales.x(cut.amountN) : null;
    const cutY = cut !== null ? scales.y(cut.rateN) : null;
    // 뷰 밖의 컷/자는 선·배지를 접는다(클램프 배지를 잘못 잡으면 커밋이 값을 파괴). 드래그 중인 축은 예외.
    const cutXVisible = dragRef.current === "amount" || (cut !== null && xScale.inDomain(cut.amountN));
    const cutYVisible = dragRef.current === "rate" || (cut !== null && yScale.inDomain(cut.rateN));
    const gxVisible = dragRef.current === "gx" || (gx !== null && xScale.inDomain(gx));
    const gyVisible = dragRef.current === "gy" || (gy !== null && yScale.inDomain(gy));

    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));
    // 배지 자리 — 세로선(대금) = 아래 스케일, 가로선(등락) = **왼쪽 스케일 가로 글자**(2026-09-17).
    const rateLabelX = Math.max(2, box.left - LBL_W - 4);
    const vLabel = (px: number): { x: number; y: number } => ({ x: clamp(px - LBL_W / 2, box.left, box.left + box.width - LBL_W), y: box.top + box.height + 3 });
    const hLabel = (py: number): { x: number; y: number } => ({ x: rateLabelX, y: clamp(py - LBL_H / 2, box.top, box.top + box.height - LBL_H) });
    const cutLabels = cut !== null && cutX !== null && cutY !== null ? { amount: vLabel(cutX), rate: hLabel(cutY) } : null;
    const gpxX = gx !== null ? scales.x(gx) : null;
    const gpxY = gy !== null ? scales.y(gy) : null;
    const guideLabels = { x: gpxX !== null ? vLabel(gpxX) : null, y: gpxY !== null ? hLabel(gpxY) : null };
    const inLabel = (x: number, y: number, l: { x: number; y: number }): boolean =>
        x >= l.x - LBL_PAD && x <= l.x + LBL_W + LBL_PAD && y >= l.y - LBL_PAD && y <= l.y + LBL_H + LBL_PAD;

    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (e.button !== 0) { downRef.current = null; return; }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        downRef.current = { x, y };
        if (cut !== null && cutLabels) {
            const target = cutXVisible && inLabel(x, y, cutLabels.amount) ? "amount" : cutYVisible && inLabel(x, y, cutLabels.rate) ? "rate" : null;
            if (target) {
                dragRef.current = target;
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
            }
        }
        if (cut === null) {
            const target = gxVisible && guideLabels.x && inLabel(x, y, guideLabels.x) ? "gx" : gyVisible && guideLabels.y && inLabel(x, y, guideLabels.y) ? "gy" : null;
            if (target) {
                dragRef.current = target;
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
            }
        }
        // 빈 곳 누름 = 팬 후보(상시). 클릭(무이동)이면 up 의 슬롭 판정이 점 클릭으로 살린다.
        panRef.current = { x, y, dom: { x0: p.dom.x0, x1: p.dom.x1, y0: p.dom.y0, y1: p.dom.y1 }, vx: p.vx, vy: p.vy };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        const rect = e.currentTarget.getBoundingClientRect();
        const drag = dragRef.current;
        if (drag) {
            if (drag === "amount" && cut) cut.onPreview({ zoneAmountN: xScale.invert(e.clientX - rect.left) });
            else if (drag === "rate" && cut) cut.onPreview({ zoneRateN: yScale.invert(e.clientY - rect.top) });
            // 자는 미리보기 로컬로만 따라오고 커밋(영속 쓰기)은 손 뗄 때 한 번(panelUi 는 set 마다 디스크를 두드린다).
            else if (drag === "gx") setGuidePrev({ k: guideKeys.x, v: xScale.invert(e.clientX - rect.left) });
            else if (drag === "gy") setGuidePrev({ k: guideKeys.y, v: yScale.invert(e.clientY - rect.top) });
            return;
        }
        const pan = panRef.current;
        if (pan && p.subject) {
            const dx = e.clientX - rect.left - pan.x;
            const dy = e.clientY - rect.top - pan.y;
            // 서수 축 — x 는 반전축이라 부호가 값 축과 반대(px 가 커질수록 서수가 작아진다).
            if (p.axes.xMode === "rank" || p.axes.yMode === "rank") {
                const span = pan.dom.x1 - pan.dom.x0;
                const x0 = p.axes.xMode === "rank" ? p.clampDom0(pan.dom.x0 + (dx / Math.max(box.width, 1)) * span, span) : pan.dom.x0;
                const y0 = p.axes.yMode === "rank" ? p.clampDom0(pan.dom.y0 - (dy / Math.max(box.height, 1)) * span, span) : pan.dom.y0;
                p.writeZoom({ x0, x1: x0 + span, y0, y1: y0 + span });
            }
            // 값 축 — 등락은 선형(%), 대금은 로그(데케이드) 공간. 한계는 axisModel 상수.
            if (p.axes.xMode === "value" || p.axes.yMode === "value") {
                const next: { x?: ValueDom; y?: ValueDom } = { ...(p.rawVdom ?? {}) };
                if (p.axes.xMode === "value") {
                    const L = Math.log10(pan.vx.hi) - Math.log10(pan.vx.lo);
                    next.x = panAmountDom(pan.vx, -(dx / Math.max(box.width, 1)) * L);
                }
                if (p.axes.yMode === "value") {
                    const S = pan.vy.hi - pan.vy.lo;
                    next.y = panRateDom(pan.vy, (dy / Math.max(box.height, 1)) * S);
                }
                p.writeVdom(next);
            }
        }
    };

    /** 휠 = 커서 중심 확대/축소(서수×서수 한정). 줌아웃 상한 = 유니버스 전체, 줌인 하한 = ZOOM_MIN_SPAN. */
    const onWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
        if (!p.zoomable) return;
        if (!p.subject || p.maxRank <= ZOOM_MIN_SPAN + 1) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        if (px < box.left || px > box.left + box.width || py < box.top || py > box.top + box.height) return;
        const f = e.deltaY < 0 ? 1 / 1.25 : 1.25;
        const next = Math.min(Math.max(p.domSpan * f, ZOOM_MIN_SPAN), Math.max(p.maxRank - 1, 1));
        if (next === p.domSpan) return;
        // x 는 반전축 — 커서 아래 서수를 고정하려면 x1(왼쪽 끝) 기준으로 셈한다.
        const ux = (px - box.left) / Math.max(box.width, 1);
        const uy = (py - box.top) / Math.max(box.height, 1);
        const cursorOrdX = p.dom.x1 - ux * p.domSpan;
        const x0 = p.clampDom0(cursorOrdX + ux * next - next, next);
        const y0 = p.clampDom0(p.dom.y0 + uy * p.domSpan - uy * next, next);
        p.writeZoom({ x0, x1: x0 + next, y0, y1: y0 + next });
    };

    /** 빈 곳 더블클릭 = 원위치(기본 200 창 + 값 축 기본 도메인). 점 위는 제외. */
    const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>): void => {
        if (!p.viewMoved) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (p.nearestAt(e.clientX - rect.left, e.clientY - rect.top) !== null) return;
        p.resetView();
    };

    const commitDrag = (e: React.PointerEvent<SVGSVGElement>): void => {
        const drag = dragRef.current;
        dragRef.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (drag === "gx" || drag === "gy") {
            setGuidePrev((prev) => {
                if (prev) setGuides((g) => ({ ...g, [prev.k]: prev.v }));
                return null;
            });
            return;
        }
        if (drag === "amount" || drag === "rate") cut?.onCommit();
    };
    const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
        const down = downRef.current;
        downRef.current = null;
        panRef.current = null;
        if (dragRef.current) {
            commitDrag(e);
            return;
        }
        if (!down) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (Math.abs(x - down.x) > CLICK_SLOP || Math.abs(y - down.y) > CLICK_SLOP) return; // 끌린 손은 클릭이 아니다
        const hit = p.nearestAt(x, y);
        if (hit) {
            setHover(null); // 옮겨간 평면에 옛 종목 툴팁이 남지 않게
            p.navigate(hit.code);
        }
    };
    const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>): void => {
        downRef.current = null;
        panRef.current = null;
        if (dragRef.current) commitDrag(e);
    };
    const onHoverMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (dragRef.current || panRef.current) { setHover(null); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = p.nearestAt(x, y);
        setHover(hit ? { x, y, ...hit } : null);
    };

    return (
        <>
            {!p.subject && <div style={empty}>차트·시트에서 종목(타점)을 짚으면 그 시각의 순위 평면이 선다</div>}
            {p.snapStatus === "error" && <div style={{ ...empty, color: FILTER }}>복기 파생 로드 실패 — {p.snapError}</div>}
            {p.snapStatus === "loading" && <div style={empty}>그날 복기 파생을 당기는 중…</div>}
            {p.snapStatus === "ready" && !p.section && <div style={empty}>그날 분봉 파생이 없다 — 미수집이거나 오늘(수집 전)이다</div>}

            {p.subject && p.section && (
                <div ref={p.wrapRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
                    <svg width={size.w} height={size.h} style={underSvg}>
                        {cut !== null && cutX !== null && cutY !== null && (() => {
                            // 존 사각 = 서수 [1..컷] — x 반전으로 1위 모서리가 오른쪽(min/max 로 방향 무관하게).
                            const zxA = clamp(scales.x(1), box.left, box.left + box.width);
                            const zxB = clamp(cutX, box.left, box.left + box.width);
                            const zyA = clamp(scales.y(1), box.top, box.top + box.height);
                            const zyB = clamp(cutY, box.top, box.top + box.height);
                            return <rect x={Math.min(zxA, zxB)} y={Math.min(zyA, zyB)} width={Math.abs(zxB - zxA)} height={Math.abs(zyB - zyA)} fill="var(--accent-soft)" opacity={0.7} />;
                        })()}
                        {xScale.ticks.map((t) => (
                            <g key={`x${t.v}`}>
                                <line x1={xScale.px(t.v)} y1={box.top} x2={xScale.px(t.v)} y2={box.top + box.height} stroke="var(--border-subtle)" />
                                <text x={xScale.px(t.v)} y={box.top + box.height - 4} textAnchor="middle" style={axisText}>{t.label}</text>
                            </g>
                        ))}
                        {yScale.ticks.map((t) => (
                            <g key={`y${t.v}`}>
                                <line x1={box.left} y1={yScale.px(t.v)} x2={box.left + box.width} y2={yScale.px(t.v)} stroke="var(--border-subtle)" />
                                <text x={box.left - 6} y={yScale.px(t.v) + 3} textAnchor="end" style={axisText}>{t.label}</text>
                            </g>
                        ))}
                        <line x1={box.left} y1={box.top} x2={box.left} y2={box.top + box.height} stroke="var(--border-strong)" />
                        <line x1={box.left} y1={box.top + box.height} x2={box.left + box.width} y2={box.top + box.height} stroke="var(--border-strong)" />
                        {/* y 제목은 왼쪽-위 가로(2026-09-17 — 세로 회전 폐지, 왼 여백은 등락 배지의 자리다). */}
                        <text x={4} y={box.top - 4} textAnchor="start" style={axisText}>{yScale.title}</text>
                        <text x={box.left + box.width / 2} y={size.h - 8} textAnchor="middle" style={axisText}>{xScale.title}</text>
                        {p.foldedRate > 0 && (
                            <g>
                                <rect x={box.left + 4} y={box.top + box.height - 16} width={64} height={13} rx={6} fill="var(--bg-tertiary)" />
                                <text x={box.left + 36} y={box.top + box.height - 6} textAnchor="middle" style={axisText}>{`≤${p.vy.lo}% ${p.foldedRate}`}</text>
                            </g>
                        )}
                    </svg>

                    <div style={{ position: "absolute", inset: 0 }}>
                        {/* 클립 상시 — 기본 창이 200 고정이라 도메인 밖 점·꼬리가 언제든 있다. */}
                        <CanvasLayers layers={p.layers} width={size.w} height={size.h} clip={box} />
                    </div>

                    <svg width={size.w} height={size.h}
                        style={{ ...overSvg, cursor: hover && p.peerThemes.has(hover.code) ? "pointer" : "grab" }}
                        onPointerDown={onPointerDown}
                        onPointerMove={(e) => { onPointerMove(e); onHoverMove(e); }}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
                        onPointerLeave={() => setHover(null)}
                        onWheel={onWheel}
                        onDoubleClick={onDoubleClick}>
                        {cut !== null && cutLabels && cutX !== null && cutY !== null && (
                            <>
                                {cutXVisible && <line x1={cutX} y1={box.top} x2={cutX} y2={box.top + box.height} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" />}
                                {cutYVisible && <line x1={box.left} y1={cutY} x2={box.left + box.width} y2={cutY} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" />}
                                <g style={{ fontSize: 10, fill: "#fff", fontVariantNumeric: "tabular-nums" }}>
                                    {cutXVisible && (
                                        <g style={{ cursor: "ew-resize" }}>
                                            <title>끌어서 거래대금 컷 옮기기(한 위씩은 조건 ▾ 의 ±)</title>
                                            <rect x={cutLabels.amount.x} y={cutLabels.amount.y} width={LBL_W} height={LBL_H} rx={3} fill={FILTER} />
                                            <text x={cutLabels.amount.x + LBL_W / 2} y={cutLabels.amount.y + 11} textAnchor="middle">대금 {cut.amountN}</text>
                                        </g>
                                    )}
                                    {cutYVisible && (
                                        <g style={{ cursor: "ns-resize" }}>
                                            <title>끌어서 등락률 컷 옮기기(한 위씩은 조건 ▾ 의 ±)</title>
                                            <rect x={cutLabels.rate.x} y={cutLabels.rate.y} width={LBL_W} height={LBL_H} rx={3} fill={FILTER} />
                                            <text x={cutLabels.rate.x + LBL_W / 2} y={cutLabels.rate.y + 11} textAnchor="middle">등락 {cut.rateN}</text>
                                        </g>
                                    )}
                                </g>
                            </>
                        )}
                        {cut === null && (gxVisible || gyVisible) && (
                            <>
                                {/* 자유 자 — 판정 컷과 다른 어휘(가는 점선·회색 배지): 술어와 무관한 자일 뿐이다. */}
                                {gxVisible && gpxX !== null && <line x1={gpxX} y1={box.top} x2={gpxX} y2={box.top + box.height} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" />}
                                {gyVisible && gpxY !== null && <line x1={box.left} y1={gpxY} x2={box.left + box.width} y2={gpxY} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" />}
                                <g style={{ fontSize: 10, fill: "#fff", fontVariantNumeric: "tabular-nums" }}>
                                    {gxVisible && guideLabels.x && gx !== null && (
                                        <g style={{ cursor: "ew-resize" }}>
                                            <title>보기용 자 — 필터와 무관(끌어서 이동)</title>
                                            <rect x={guideLabels.x.x} y={guideLabels.x.y} width={LBL_W} height={LBL_H} rx={3} fill="var(--text-tertiary)" />
                                            <text x={guideLabels.x.x + LBL_W / 2} y={guideLabels.x.y + 11} textAnchor="middle">{xScale.fmt(gx)}</text>
                                        </g>
                                    )}
                                    {gyVisible && guideLabels.y && gy !== null && (
                                        <g style={{ cursor: "ns-resize" }}>
                                            <title>보기용 자 — 필터와 무관(끌어서 이동)</title>
                                            <rect x={guideLabels.y.x} y={guideLabels.y.y} width={LBL_W} height={LBL_H} rx={3} fill="var(--text-tertiary)" />
                                            <text x={guideLabels.y.x + LBL_W / 2} y={guideLabels.y.y + 11} textAnchor="middle">{yScale.fmt(gy)}</text>
                                        </g>
                                    )}
                                </g>
                            </>
                        )}
                        {hover && (() => {
                            const ts = p.peerThemes.get(hover.code);
                            const text = `${nameOf(hover.code)} · ${yScale.chip} ${yScale.fmt(hover.rate)} · ${xScale.chip} ${xScale.fmt(hover.amount)}${ts ? ` · ${ts.join("·")} · 클릭 = 이동` : ""}`;
                            const tb = tooltipBoxOf(hover, text, { w: size.w, h: size.h });
                            return (
                                <g style={{ pointerEvents: "none" }}>
                                    <rect x={tb.x} y={tb.y} width={tb.w} height={tb.h} rx={3} fill="var(--bg-tertiary)" stroke="var(--border-default)" strokeWidth={0.5} />
                                    <text x={tb.x + 6} y={tb.y + 13} style={{ fontSize: 11, fill: "var(--text-primary)" }}>{text}</text>
                                </g>
                            );
                        })()}
                    </svg>
                </div>
            )}

            {/* footer = 시각 타임라인(전역 setTime 의 큰 손잡이) + 꼬리 설정. 띠 = 존 재적(연동 조건판만). */}
            {p.subject && p.section && p.minuteRange && (
                <div style={footer}>
                    <span style={{ flexShrink: 0 }}>시각</span>
                    <TimelineBar lo={p.minuteRange.lo} hi={p.minuteRange.hi} minute={p.minute}
                        pointMinutes={p.pointMinutes} segments={segments}
                        trailFrom={p.trailMinutes.length > 0 ? p.trailMinutes[0] : null}
                        // 동등값 가드 — setTime 은 같은 값이어도 새 focus 객체를 만들어 전역 재렌더를 일으킨다.
                        onScrub={(m) => { const t = fmtHms(m); if (useWorkbench.getState().focus.time !== t) setTime(t); }} />
                    <TrailControl />
                </div>
            )}
        </>
    );
}

const empty: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12 };
const underSvg: React.CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
const overSvg: React.CSSProperties = { position: "absolute", inset: 0, touchAction: "none", userSelect: "none" };
const axisText: React.CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
const footer: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "4px 10px", borderTop: "1px solid var(--border-default)", fontSize: 11, color: "var(--text-secondary)", flexWrap: "wrap" };
