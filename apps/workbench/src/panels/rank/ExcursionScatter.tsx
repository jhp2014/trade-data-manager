import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPE, type MouseEvent as RME } from "react";
import { useWorkbench } from "../../store/workbench.js";
import type { Excursion } from "./pathStats.js";

// 진입 후 편차(익절 MFE × 손절 MAE) 산점 — 두 줄 스택(진입손절/트레일링)이 뷰(줌·팬·손절 가시범위)를 공유.
//  · 정사각 격자: %당 픽셀(pxu) 고정 → "+2%p 거리"가 두 축·두 줄에서 물리적으로 동일. 가로=익절(→오른쪽), 세로=손절(↓아래로 깊어짐).
//  · 이상영역 = 우상단. 목표(익절)·손절 기준선은 위쪽 시뮬값과 연동 — 진입손절 줄의 우상단(목표선 오른쪽 ∧ 손절선 위) = 시뮬 '승' 집합.
//  · 높이 드래그 = 손절 가시범위 / 패널 폭 = 익절 가시범위. 벗어난 타점은 축약(▼/▶) + 팬(빈 곳 드래그). Ctrl+휠 줌, ⟲ 원위치.
//  · focus 종목 = 글로우 + 상시 직교선. 점 hover = 직교선 + %값. 점 클릭 = 이동.

const UP = "#1baf7a";
const DOWN = "#eb6834";
const FOCUS = "#0ea5e9";
const WINC = "#1baf7a";
const STOPC = "#e24b4a";
const GL = 42, GR = 14, TOP = 18, AXB = 26;
const DEF_PXU = 20, MIN_PXU = 7, MAX_PXU = 64;
const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// fitted=true → pxu·panX 를 데이터+패널폭에 자동 맞춤(빈 격자 낭비 없음). 수동 줌·팬 하면 fitted=false 로 잠금, ⟲ 로 복귀.
interface ViewV { pxu: number; panX: number; panY: number; fitted: boolean } // panX=좌측 익절%, panY=상단 손절mag
interface Pt { key: string; name: string; x: number; d: number; up: boolean; focus: boolean }

const ROWDEFS: { label: string; yOf: (e: Excursion) => number }[] = [
    { label: "익절(MFE) ↔ 진입 손절(MAE 전) · 우상단 = 시뮬 '승'", yOf: (e) => e.maePre },
    { label: "익절(MFE) ↔ 트레일링(MAE 후)", yOf: (e) => e.maePost },
];

/** 높이 조절 손잡이 — 증분 dy 를 콜백으로. 히트맵·산점 공용. */
export function ResizeGrip({ onResize, title }: { onResize: (deltaY: number) => void; title?: string }): JSX.Element {
    const ref = useRef<{ y: number } | null>(null);
    return (
        <div title={title ?? "높이 조절 (드래그)"}
            onPointerDown={(e) => { ref.current = { y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { const r = ref.current; if (!r) return; const dy = e.clientY - r.y; r.y = e.clientY; onResize(dy); }}
            onPointerUp={(e) => { ref.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 12, cursor: "ns-resize", color: "var(--text-tertiary)", borderTop: "1px dashed var(--border-subtle)", touchAction: "none", userSelect: "none" }}>
            <span style={{ fontSize: 11, lineHeight: 1, letterSpacing: 2 }}>⣿</span>
        </div>
    );
}

export function ExcursionScatter({ excursions, nameOf, onGo, target, stop, height, setHeight }: {
    excursions: Excursion[]; nameOf: (c: string) => string; onGo: (key: string) => void;
    target: number; stop: number; height: number; setHeight: (h: number) => void;
}): JSX.Element {
    const activePoint = useWorkbench((s) => s.activePoint);
    const activeKey = activePoint ? `${activePoint.code}|${activePoint.date}|${activePoint.time}` : null;
    const [view, setView] = useState<ViewV>({ pxu: DEF_PXU, panX: 0, panY: 0, fitted: true });
    const [hover, setHover] = useState<{ row: number; key: string } | null>(null);
    const [tip, setTip] = useState<{ cx: number; cy: number; text: string } | null>(null); // 교차선 툴팁(wrap 상대좌표)
    const wrapRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(560);
    useEffect(() => {
        const el = wrapRef.current; if (!el) return;
        const ro = new ResizeObserver((es) => setWidth(es[0].contentRect.width));
        ro.observe(el); return () => ro.disconnect();
    }, []);
    const plotW = Math.max(120, width - GL - GR);

    const ext = useMemo(() => {
        let maxX = 1, maxD = 1;
        for (const e of excursions) {
            if (e.mfe > maxX) maxX = e.mfe;
            const d1 = Math.max(0, -e.maePre), d2 = Math.max(0, -e.maePost);
            if (d1 > maxD) maxD = d1; if (d2 > maxD) maxD = d2;
        }
        return { maxX, maxD };
    }, [excursions]);

    // fit pxu — 패널 폭에 익절 데이터 범위(+여유)를 채움. 데이터 적으면 셀이 너무 커지지 않게 하한 분모.
    const fitPxu = clampN(plotW / Math.max(8, ext.maxX + 2), MIN_PXU, MAX_PXU);
    const pxu = view.fitted ? fitPxu : view.pxu;
    const panX = view.fitted ? 0 : view.panX;
    const panY = view.fitted ? 0 : view.panY;
    const isDefault = view.fitted;

    // 최신 유효 뷰/지오메트리를 ref 로 노출 — 마운트 1회 부착하는 wheel 리스너가 참조(재부착 회피).
    const effRef = useRef({ pxu, panX, panY }); effRef.current = { pxu, panX, panY };
    const geomRef = useRef({ plotW, height, ext }); geomRef.current = { plotW, height, ext };
    const svg0 = useRef<SVGSVGElement>(null);
    const svg1 = useRef<SVGSVGElement>(null);
    const svgRefs = [svg0, svg1];
    useEffect(() => {
        const offs: Array<() => void> = [];
        svgRefs.forEach((ref) => {
            const el = ref.current; if (!el) return;
            const onW = (e: WheelEvent): void => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                const rect = el.getBoundingClientRect();
                const px = e.clientX - rect.left - GL, py = e.clientY - rect.top - TOP;
                const v = effRef.current, g = geomRef.current;
                const dataX = v.panX + px / v.pxu, dataY = v.panY + py / v.pxu;
                const npxu = clampN(v.pxu * (e.deltaY < 0 ? 1.15 : 0.87), MIN_PXU, MAX_PXU);
                const nPanX = clampN(dataX - px / npxu, 0, Math.max(0, g.ext.maxX + 3 - g.plotW / npxu));
                const nPanY = clampN(dataY - py / npxu, 0, Math.max(0, g.ext.maxD + 1 - g.height / npxu));
                setView({ pxu: npxu, panX: nPanX, panY: nPanY, fitted: false });
            };
            el.addEventListener("wheel", onW, { passive: false });
            offs.push(() => el.removeEventListener("wheel", onW));
        });
        return () => offs.forEach((o) => o());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 팬 — 빈 곳 드래그(점 위 pointerdown 은 제외해 클릭=이동 보존). 팬 시작 시 현재 유효 pxu 로 수동 잠금.
    const panRef = useRef<{ x: number; y: number; panX: number; panY: number; pxu: number } | null>(null);
    const onPanDown = (e: RPE): void => {
        if ((e.target as Element).tagName === "circle") return;
        panRef.current = { x: e.clientX, y: e.clientY, panX, panY, pxu };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPanMove = (e: RPE): void => {
        const p = panRef.current; if (!p) return;
        const nx = clampN(p.panX - (e.clientX - p.x) / p.pxu, 0, Math.max(0, ext.maxX + 3 - plotW / p.pxu));
        const ny = clampN(p.panY - (e.clientY - p.y) / p.pxu, 0, Math.max(0, ext.maxD + 1 - height / p.pxu));
        setView({ pxu: p.pxu, panX: nx, panY: ny, fitted: false });
    };
    const onPanUp = (e: RPE): void => { panRef.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };

    const showTip = (ev: RME, p: Pt): void => {
        const el = wrapRef.current; if (!el) return;
        const rect = el.getBoundingClientRect();
        setTip({ cx: ev.clientX - rect.left, cy: ev.clientY - rect.top, text: `${p.name} · 익절 +${p.x.toFixed(1)}% · 손절 -${p.d.toFixed(1)}%` });
    };

    // 직교선 + 축 투영 %칩. 종목명·수치는 커서 추종 HTML 툴팁(tip)으로 나오므로 여기 박스는 두지 않음.
    const crosshair = (p: Pt, X: number, Y: number, k: string): JSX.Element[] => [
        <line key={`${k}v`} x1={X} y1={Y} x2={X} y2={TOP} stroke={FOCUS} strokeWidth={1} strokeDasharray="3 3" />,
        <line key={`${k}h`} x1={X} y1={Y} x2={GL} y2={Y} stroke={FOCUS} strokeWidth={1} strokeDasharray="3 3" />,
        <rect key={`${k}xb`} x={X - 15} y={TOP - 15} width={32} height={13} rx={3} fill={FOCUS} />,
        <text key={`${k}xt`} x={X + 1} y={TOP - 5} textAnchor="middle" fontSize={9.5} fill="#fff" fontWeight={600}>+{p.x.toFixed(1)}</text>,
        <rect key={`${k}yb`} x={GL - 37} y={Y - 7} width={33} height={13} rx={3} fill={FOCUS} />,
        <text key={`${k}yt`} x={GL - 20} y={Y + 3} textAnchor="middle" fontSize={9.5} fill="#fff" fontWeight={600}>-{p.d.toFixed(1)}</text>,
    ];

    const rowSvg = (i: number): JSX.Element => {
        const rd = ROWDEFS[i];
        const pb = TOP + height, pr = GL + plotW;
        const cX = (x: number): number => GL + (x - panX) * pxu;
        const cY = (d: number): number => TOP + (d - panY) * pxu;
        const pts: Pt[] = excursions.map((e) => ({ key: e.key, name: nameOf(e.key.split("|")[0]), x: e.mfe, d: Math.max(0, -rd.yOf(e)), up: e.up, focus: e.key === activeKey }));

        // 격자는 0.5% 단위(미세선). 라벨은 겹치지 않을 만큼만 — 픽셀/단위(pxu)에 따라 0.5→30px 이상 되는 최소 간격 채택.
        const HALF = 0.5;
        const lblStep = ([0.5, 1, 2, 5, 10, 20].find((s) => s * pxu >= 30) ?? 20);
        const isLbl = (v: number): boolean => Math.abs(v / lblStep - Math.round(v / lblStep)) < 1e-6;
        const grid: JSX.Element[] = [];
        for (let k = Math.max(0, Math.ceil(panX / HALF)); ; k++) {
            const x = k * HALF, gx = cX(x); if (gx > pr + 0.5) break; if (gx < GL - 0.5) continue;
            const lbl = isLbl(x);
            grid.push(<line key={`gx${k}`} x1={gx} y1={TOP} x2={gx} y2={pb} stroke="var(--border-subtle)" strokeWidth={1} opacity={lbl ? 0.7 : 0.3} />);
            if (lbl) grid.push(<text key={`gxl${k}`} x={gx} y={pb + 13} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">+{x % 1 === 0 ? x : x.toFixed(1)}</text>);
        }
        for (let k = Math.max(0, Math.ceil(panY / HALF)); ; k++) {
            const d = k * HALF, gy = cY(d); if (gy > pb + 0.5) break; if (gy < TOP - 0.5) continue;
            const lbl = isLbl(d);
            grid.push(<line key={`gy${k}`} x1={GL} y1={gy} x2={pr} y2={gy} stroke="var(--border-subtle)" strokeWidth={1} opacity={lbl ? 1 : 0.3} />);
            if (lbl) grid.push(<text key={`gyl${k}`} x={GL - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="var(--text-tertiary)">{d === 0 ? "0" : `-${d % 1 === 0 ? d : d.toFixed(1)}`}</text>);
        }

        const overlays: JSX.Element[] = [];
        const xT = cX(target), yS = cY(-stop);
        const winX = clampN(xT, GL, pr), winY = clampN(yS, TOP, pb);
        if (winX < pr && winY > TOP) overlays.push(<rect key="win" x={winX} y={TOP} width={pr - winX} height={winY - TOP} fill={WINC} opacity={0.09} />);
        if (xT >= GL && xT <= pr) {
            overlays.push(<line key="tl" x1={xT} y1={TOP} x2={xT} y2={pb} stroke={WINC} strokeWidth={1.3} strokeDasharray="5 3" opacity={0.85} />);
            overlays.push(<text key="tll" x={xT + 3} y={TOP + 11} fontSize={10} fill={WINC} fontWeight={600}>목표 +{target.toFixed(1)}</text>);
        }
        if (yS >= TOP && yS <= pb) {
            overlays.push(<line key="sl" x1={GL} y1={yS} x2={pr} y2={yS} stroke={STOPC} strokeWidth={1.3} strokeDasharray="5 3" opacity={0.85} />);
            overlays.push(<text key="sll" x={pr - 3} y={yS - 4} textAnchor="end" fontSize={10} fill={STOPC} fontWeight={600}>손절 {stop.toFixed(1)}</text>);
        }

        let below = 0, right = 0;
        const halos: JSX.Element[] = [], circles: JSX.Element[] = [];
        for (const p of pts) {
            const X = cX(p.x), Y = cY(p.d);
            if (X > pr + 0.5) { if (Y <= pb + 0.5 && Y >= TOP - 0.5) right++; continue; }
            if (Y > pb + 0.5) { below++; continue; }
            if (X < GL - 0.5 || Y < TOP - 0.5) continue;
            const col = p.focus ? FOCUS : p.up ? UP : DOWN;
            if (p.focus) {
                halos.push(<circle key={`h${p.key}`} cx={X} cy={Y} r={12} fill={FOCUS} opacity={0.16} />);
                halos.push(<circle key={`h2${p.key}`} cx={X} cy={Y} r={8} fill="none" stroke={FOCUS} strokeWidth={2} opacity={0.5} />);
            }
            circles.push(
                <circle key={p.key} cx={X} cy={Y} r={p.focus ? 5 : 4.3} fill={col} fillOpacity={p.focus ? 1 : 0.82}
                    stroke="var(--bg-primary)" strokeWidth={1} style={{ cursor: "pointer" }}
                    onMouseEnter={(ev) => { setHover({ row: i, key: p.key }); showTip(ev, p); }}
                    onMouseMove={(ev) => showTip(ev, p)}
                    onMouseLeave={() => { setHover((h) => (h && h.key === p.key ? null : h)); setTip(null); }}
                    onClick={(ev) => { ev.stopPropagation(); onGo(p.key); }} />,
            );
        }

        const hairs: JSX.Element[] = [];
        const fp = pts.find((p) => p.focus);
        if (fp) { const X = cX(fp.x), Y = cY(fp.d); if (X >= GL && X <= pr && Y >= TOP && Y <= pb) hairs.push(...crosshair(fp, X, Y, "f")); }
        if (hover && hover.row === i) { const hp = pts.find((p) => p.key === hover.key && !p.focus); if (hp) { const X = cX(hp.x), Y = cY(hp.d); if (X >= GL && X <= pr && Y >= TOP && Y <= pb) hairs.push(...crosshair(hp, X, Y, "hv")); } }

        const chips: JSX.Element[] = [];
        if (below) chips.push(<text key="cb" x={GL + plotW / 2} y={pb + 24} textAnchor="middle" fontSize={10.5} fill={DOWN} fontWeight={600}>▼ 손절 깊음 {below}개 (아래로 드래그)</text>);
        if (right) chips.push(<text key="cr" x={pr - 3} y={TOP + 11} textAnchor="end" fontSize={10} fill={DOWN} fontWeight={600}>▶ {right}개</text>);

        const svgH = TOP + height + AXB;
        return (
            <svg ref={svgRefs[i]} width={width} height={svgH} onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp}
                role="img" aria-label={rd.label} style={{ display: "block", touchAction: "none", cursor: "grab" }}>
                {overlays[0] /* win 배경 먼저 */}
                {grid}
                <line x1={GL} y1={TOP} x2={pr} y2={TOP} stroke="var(--border-default)" strokeWidth={1.4} />
                <line x1={GL} y1={TOP} x2={GL} y2={pb} stroke="var(--border-default)" strokeWidth={1.4} />
                {overlays.slice(1)}
                <text x={12} y={TOP + height / 2} fontSize={10.5} fill="var(--text-tertiary)" textAnchor="middle" transform={`rotate(-90 12 ${TOP + height / 2})`}>손절 %</text>
                <text x={pr} y={svgH - 1} fontSize={10.5} fill="var(--text-tertiary)" textAnchor="end">익절 % →</text>
                <text x={pr - 6} y={TOP + 12} fontSize={10.5} fill={WINC} textAnchor="end" opacity={0.85}>이상 ↗</text>
                {halos}{circles}{hairs}{chips}
            </svg>
        );
    };

    return (
        <div ref={wrapRef} style={{ position: "relative", width: "100%", userSelect: "none", WebkitUserSelect: "none" }}>
            {!isDefault && (
                <button onClick={() => setView({ pxu: DEF_PXU, panX: 0, panY: 0, fitted: true })} title="원위치 (자동 맞춤)"
                    style={{ position: "absolute", right: 2, top: -2, zIndex: 5, border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-secondary)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "2px 5px" }}>⟲</button>
            )}
            {ROWDEFS.map((rd, i) => (
                <div key={i} style={{ marginBottom: i === 0 ? 4 : 0 }}>
                    <div style={rowLabel}>{rd.label}</div>
                    {rowSvg(i)}
                </div>
            ))}
            <ResizeGrip onResize={(dy) => setHeight(clampN(height + dy, 90, 340))} title="높이 조절 — 손절 가시범위" />
            {tip && (
                <div style={{
                    position: "absolute", pointerEvents: "none", zIndex: 6, top: tip.cy + 14,
                    left: tip.cx < width / 2 ? tip.cx + 12 : undefined,
                    right: tip.cx >= width / 2 ? width - tip.cx + 12 : undefined,
                    background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 5,
                    padding: "3px 8px", fontSize: 11, whiteSpace: "nowrap", color: "var(--text-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                }}>{tip.text}</div>
            )}
        </div>
    );
}

const rowLabel: CSSProperties = { fontSize: 11.5, color: "var(--text-secondary)", margin: "2px 0 3px 2px" };
