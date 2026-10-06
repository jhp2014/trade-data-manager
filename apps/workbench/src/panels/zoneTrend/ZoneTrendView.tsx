// 테마 선 차트의 **렌더 단위**(상태 최소) — 주인공 칸 하나. 미래의 썸네일 칸이 같은 컴포넌트의 축소판이
// 되도록, 크로스헤어·hover·x/y 창은 **controlled** 로 받는다(칸끼리 동기의 전제 — decisions.md).
// 캔버스 1장 + 포인터 오버레이 SVG 1겹 — DOM 노드 최소(골격 캔버스 전환의 교훈: 비용 = 노드 수).
//
// 손짓 = lightweight-charts 관례의 이식(2026-10-06 밤): 드래그 = 상하좌우 팬 · 휠 = 시간 줌(커서 중심) ·
// Ctrl+휠 = 세로 줌(골격 선례) · 더블클릭 = 전체 복귀. 휠은 **네이티브 non-passive 리스너**다 —
// React 의 onWheel 은 루트 passive 라 preventDefault 가 안 먹혀, Ctrl+휠이 브라우저 페이지 줌을 부른다.
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasLayers } from "../canvas/CanvasPainter.js";
import { tooltipBoxOf } from "../themeRank/tooltipBox.js";
import {
    LINE_HIT_R, X_TAIL_MIN, foldedCounts, memberOpsOf, nearestLine, panXView, panYView, zoneTrendLayers,
    zoomXView, zoomYView, type Scales, type TrendBox, type XView, type YView,
} from "./zoneTrendLayers.js";
import type { HoverDetail, ZoneTrendModel } from "./zoneTrendModel.js";

/** 이만큼 넘게 끌렸으면 클릭이 아니다(px) — 단면 CLICK_SLOP 과 같은 값. */
const CLICK_SLOP = 4;
// 좌우를 넉넉히 — 선·글자가 판 가장자리에 붙지 않게(2026-10-06 저녁 사용자 피드백).
const PAD = { left: 16, top: 8, right: 16, bottom: 8 };

export interface ZoneTrendViewProps {
    model: ZoneTrendModel;
    /** 스냅샷 실제 분 범위 — 팬/줌 한계([lo, hi + 꼬리])의 재료. */
    minuteRange: { lo: number; hi: number };
    /** 현재 분(멤버십·선의 오른끝). */
    minute: number;
    /** x(시간) 창 — controlled(자동 = 시작~현재 분 +꼬리, 수동·복귀 규칙은 판이 진다). */
    xView: XView;
    onXView: (v: XView | null) => void;
    /** y 창 — controlled(자동 맞춤·수동·리셋 규칙은 판이 진다). */
    yView: YView;
    /** 수동 조정 커밋. null = 자동 맞춤으로 복귀(더블클릭). */
    onYView: (v: YView | null) => void;
    hovered: string | null;
    onHover: (code: string | null) => void;
    /** 짚은 선의 분차트 상세(캔들·대금 마커·밴드·사슬) — 계산은 모델 소유자(판) 몫. null = 없음. */
    hoverDetail: HoverDetail | null;
    /** 크로스헤어 분 — controlled(칸 동기의 전제). null = 없음. */
    crosshair: number | null;
    onCrosshair: (minute: number | null) => void;
    /** 선 클릭 = 시선 이동. */
    onPick: (code: string) => void;
    /** hover 칩 본문 — 크로스헤어 분의 실값은 호출자(모델 소유자)가 안다. */
    chipTextOf: (code: string, minute: number) => string;
}

export function ZoneTrendView(p: ZoneTrendViewProps): JSX.Element {
    // 크기 관측 — 요소는 state, 관측은 이펙트(StrictMode 함정: useThemePlane 의 RO 패턴 그대로).
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!wrapEl) return;
        const ro = new ResizeObserver((es) => {
            const w = es[0].contentRect.width;
            const h = es[0].contentRect.height;
            setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        });
        ro.observe(wrapEl);
        return () => ro.disconnect();
    }, [wrapEl]);

    // box 는 참조 안정이어야 한다 — CanvasLayers 의 clip 의존성이라, 렌더마다 새 객체면 포인터가
    // 움직일 때마다(ptr state) 캔버스 전체를 다시 칠한다(리뷰 지적).
    const box: TrendBox = useMemo(() => ({
        left: PAD.left,
        top: PAD.top,
        width: Math.max(0, size.w - PAD.left - PAD.right),
        height: Math.max(0, size.h - PAD.top - PAD.bottom),
    }), [size.w, size.h]);
    const x = p.xView;
    const span = Math.max(x.hi - x.lo, 1);
    const y = p.yView;
    const ySpan = Math.max(y.hi - y.lo, 0.1);
    const scales: Scales & { invertX: (px: number) => number } = useMemo(() => ({
        x: (m: number) => box.left + ((m - x.lo) / span) * box.width,
        y: (r: number) => box.top + ((y.hi - r) / ySpan) * box.height,
        invertX: (px: number) => Math.round(x.lo + ((px - box.left) / Math.max(box.width, 1)) * span),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [box, x.lo, span, y.hi, ySpan]);
    /** 팬/줌 한계 — 세션 창 + 오른끝 꼬리(자동 창은 늘 이 안이다). */
    const xBounds: XView = useMemo(
        () => ({ lo: p.minuteRange.lo, hi: p.minuteRange.hi + X_TAIL_MIN }),
        [p.minuteRange.lo, p.minuteRange.hi],
    );

    // 멤버 ops — hover 무관 memo(성능 seam). hover 는 아래 layers memo 에서 껍데기만 다시 만든다.
    const memberOps = useMemo(() => memberOpsOf(p.model.members, scales), [p.model, scales]);
    const layers = useMemo(
        () => zoneTrendLayers({
            model: p.model, memberOps, hovered: p.hovered, hoverDetail: p.hoverDetail, minute: p.minute,
            view: { fromMinute: x.lo, toMinute: x.hi }, yView: y, box, scales,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [p.model, memberOps, p.hovered, p.hoverDetail, p.minute, x, y, box, scales],
    );
    const folded = foldedCounts(p.model, y);
    const fmtPct = (v: number): string => `${Math.round(v * 10) / 10}%`;

    // 집기 순서 — 시선 먼저(동점이면 시선이 이긴다).
    const hitLines = useMemo(
        () => (p.model.subject !== null ? [p.model.subject, ...p.model.members] : p.model.members),
        [p.model],
    );

    // 포인터 px — 칩 자리는 뷰 로컬 표현(의미 상태(hovered·crosshair·창)는 controlled).
    const [ptr, setPtr] = useState<{ x: number; y: number } | null>(null);
    const [down, setDown] = useState<{ x: number; y: number } | null>(null);
    // 팬 — 슬롭을 넘어 끌리면 클릭이 아니라 팬이다(시작 시점의 두 창을 기억해 상대 이동 — 차트 드래그).
    const panRef = useRef<{ x: number; y: number; xv: XView; yv: YView } | null>(null);

    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const d = down;
        if (d && panRef.current === null && (Math.abs(px - d.x) > CLICK_SLOP || Math.abs(py - d.y) > CLICK_SLOP))
            panRef.current = { x: d.x, y: d.y, xv: x, yv: y };
        const pan = panRef.current;
        if (pan) {
            setPtr(null);
            p.onHover(null);
            p.onCrosshair(null);
            // 드래그 = 내용이 손을 따라온다: 오른쪽으로 끌면 과거가 보인다(x 창은 왼쪽으로).
            const dxMin = ((px - pan.x) / Math.max(box.width, 1)) * (pan.xv.hi - pan.xv.lo);
            const nx = panXView(pan.xv, -dxMin, xBounds);
            if (nx !== x) p.onXView(nx);
            const dyPct = ((py - pan.y) / Math.max(box.height, 1)) * (pan.yv.hi - pan.yv.lo);
            const ny = panYView(pan.yv, dyPct);
            if (ny !== y) p.onYView(ny);
            return;
        }
        setPtr({ x: px, y: py });
        const inBox = px >= box.left && px <= box.left + box.width && py >= box.top && py <= box.top + box.height;
        // 현재 분 너머는 크로스헤어도 서지 않는다(미래 실값 금지). 창이 통째로 미래면(팬) 안 세운다.
        const m = Math.min(p.minute, Math.max(x.lo, scales.invertX(px)));
        p.onCrosshair(inBox && m >= x.lo ? m : null);
        p.onHover(nearestLine(px, py, hitLines, scales, box, LINE_HIT_R));
    };
    const onPointerLeave = (): void => {
        setPtr(null);
        setDown(null);
        panRef.current = null;
        p.onHover(null);
        p.onCrosshair(null);
    };
    const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
        const d = down;
        setDown(null);
        const panned = panRef.current !== null;
        panRef.current = null;
        if (!d || panned) return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        if (Math.abs(px - d.x) > CLICK_SLOP || Math.abs(py - d.y) > CLICK_SLOP) return;
        const hit = nearestLine(px, py, hitLines, scales, box, LINE_HIT_R);
        if (hit !== null) p.onPick(hit);
    };
    /** 빈 곳 더블클릭 = 두 창 모두 자동 복귀(선 위는 제외 — 클릭 이동과 안 다툰다). */
    const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>): void => {
        const r = e.currentTarget.getBoundingClientRect();
        if (nearestLine(e.clientX - r.left, e.clientY - r.top, hitLines, scales, box, LINE_HIT_R) !== null) return;
        p.onXView(null);
        p.onYView(null);
    };

    // ── 휠 — 네이티브 non-passive(머리 주석). 핸들러는 ref 로 최신 상태를 본다(재등록 없이).
    const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
    const wheelRef = useRef<(e: WheelEvent) => void>(() => undefined);
    wheelRef.current = (e: WheelEvent): void => {
        const r = svgEl?.getBoundingClientRect();
        if (!r) return;
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        if (px < box.left || px > box.left + box.width || py < box.top || py > box.top + box.height) return;
        e.preventDefault();
        const f = e.deltaY < 0 ? 1 / 1.25 : 1.25;
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+휠 = 세로 줌(골격 선례) — 커서 값 고정.
            const u = (box.top + box.height - py) / Math.max(box.height, 1);
            const next = zoomYView(y, f, u);
            if (next !== y) p.onYView(next);
        } else {
            // 휠 = 시간 줌(lightweight-charts 관례) — 커서 분 고정.
            const u = (px - box.left) / Math.max(box.width, 1);
            const next = zoomXView(x, f, u, xBounds);
            if (next !== x) p.onXView(next);
        }
    };
    useEffect(() => {
        if (!svgEl) return;
        const h = (e: WheelEvent): void => wheelRef.current(e);
        svgEl.addEventListener("wheel", h, { passive: false });
        return () => svgEl.removeEventListener("wheel", h);
    }, [svgEl]);

    // 렌더 시점에도 현재 분으로 클램프 — 포인터를 둔 채 스크럽으로 minute 이 뒤로 가면, 다음
    // pointermove 전까지 이동 시점 클램프만으로는 칩이 다시 미래를 말한다(재확인 리뷰 지적).
    const cross = p.crosshair !== null ? Math.min(p.crosshair, p.minute) : null;
    const crossPx = cross !== null && cross >= x.lo ? scales.x(cross) : null;
    const chip = p.hovered !== null && cross !== null && ptr !== null
        ? { text: p.chipTextOf(p.hovered, cross), at: ptr }
        : null;

    return (
        <div ref={setWrapEl} style={{ position: "relative", flex: 1, minHeight: 0 }}>
            <CanvasLayers layers={layers} width={size.w} height={size.h} clip={box} />
            <svg ref={setSvgEl} width={size.w} height={size.h} style={{ ...overSvg, cursor: p.hovered !== null ? "pointer" : "default" }}
                onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setDown({ x: e.clientX - r.left, y: e.clientY - r.top });
                    // 캡처 — 판 밖에서 손을 떼도 up 이 이 판으로 온다(팬 커밋). jsdom 은 setup 이 스텁.
                    e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => { setDown(null); panRef.current = null; }}
                onPointerLeave={onPointerLeave}
                onDoubleClick={onDoubleClick}>
                {crossPx !== null && (
                    <line x1={crossPx} y1={box.top} x2={crossPx} y2={box.top + box.height}
                        stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 4" pointerEvents="none" />
                )}
                {folded.above > 0 && (
                    // 상단 접힘 배지 — y 창 위에 머리가 있는 선 수(단면 접힘 배지의 거울).
                    <g pointerEvents="none">
                        <rect x={box.left + box.width - 86} y={box.top + 2} width={84} height={13} rx={6} fill="var(--bg-tertiary)" />
                        <text x={box.left + box.width - 44} y={box.top + 12} textAnchor="middle" style={{ fontSize: 10, fill: "var(--text-tertiary)" }}>
                            {`>${fmtPct(y.hi)} 위 ${folded.above}`}
                        </text>
                    </g>
                )}
                {folded.below > 0 && (
                    // 하단 접힘 배지 — y 창 아래 머리가 말없이 사라지지 않게(리뷰 지적).
                    // x 정시 글자 줄(바닥 −4) 바로 **위**에 — 같은 줄이면 마지막 시각 글자를 덮는다(재확인 지적).
                    <g pointerEvents="none">
                        <rect x={box.left + box.width - 86} y={box.top + box.height - 30} width={84} height={13} rx={6} fill="var(--bg-tertiary)" />
                        <text x={box.left + box.width - 44} y={box.top + box.height - 20} textAnchor="middle" style={{ fontSize: 10, fill: "var(--text-tertiary)" }}>
                            {`${fmtPct(y.lo)} 아래 ${folded.below}`}
                        </text>
                    </g>
                )}
                {chip !== null && (() => {
                    const tb = tooltipBoxOf(chip.at, chip.text, { w: size.w, h: size.h });
                    return (
                        <g pointerEvents="none">
                            <rect x={tb.x} y={tb.y} width={tb.w} height={tb.h} rx={3} fill="var(--bg-tertiary)" stroke="var(--border-default)" strokeWidth={0.5} />
                            <text x={tb.x + 6} y={tb.y + 13} style={{ fontSize: 11, fill: "var(--text-primary)" }}>{chip.text}</text>
                        </g>
                    );
                })()}
            </svg>
        </div>
    );
}

const overSvg: React.CSSProperties = { position: "absolute", inset: 0, touchAction: "none", userSelect: "none" };
