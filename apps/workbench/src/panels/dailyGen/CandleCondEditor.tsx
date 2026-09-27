// 캔들 술어의 **편집면** — 조건판 캔들 줄에서 여는 팝오버(테마·돌파와 같은 결, 2026-09-27).
// 왼쪽은 **드래그 캔들**(y = 등락률 공간): 축마다 핸들 하나가 From 을 쥐고 값 배지가 따라붙는다.
// 오른쪽은 축 6줄 — ON/OFF 스위치(사슬 판 Switch 관용구) + From·To 숫자 칸(양방향 — 어느 쪽을
// 만져도 같은 payload). 끈 축은 줄이 흐려지고 핸들이 회색이 된다(값은 남는다 — 테마 컷 규칙).
//
// 그림의 규약 — 캔들은 **표본 하나**다(조건의 경계값들로 세운 그림이지 실제 봉이 아니다):
//  · 시가 O 는 rate(종가)·openClose 에서 역산한다(rate 가 꺼져 있으면 표본 종가 5%).
//  · rate·highRate 핸들은 등락률 공간의 절대 위치, 시가→X 셋은 시가 기점, 기준선은 종가 기점이다.
//  · 드래그는 **From 만** 만진다(핸들 = 대표 경계). To 는 숫자 칸에서 — 양끝 조건은 폼이 정확하다.
//
// ⚠ 드래그의 좌표 기준(시가·종가·y 스케일)은 **pointerdown 순간에 얼린다** — 살아 있는 값으로 매
// 이동마다 다시 재면 "시가 = 종가 − 시가→종가" 역산이 제 꼬리를 물어 값이 발산한다(2026-09-27 리뷰
// H1). 커밋도 pointerup 에서 한 번 — 이동마다 저장하면 localStorage 직렬화와 깔때기 디바운스가
// 매 픽셀 다시 돈다(같은 리뷰 M4). 드래그 중 그림·배지는 로컬 draft 를 본다.
import { useRef, useState } from "react";
import {
    CANDLE_AXES,
    CANDLE_AXIS_LABEL,
    type CandleAxis,
    type CandleAxisCond,
    type CellPredicate,
} from "@trade-data-manager/market/domain";
import { OptNumField } from "../../components/NumField.js";
import { AnchoredPopover } from "../../ui/popover/AnchoredPopover.js";

type CandlePred = Extract<CellPredicate, { kind: "candle" }>;

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "2px 0" };
const rowLabel: React.CSSProperties = { width: 72, flexShrink: 0, color: "var(--text-secondary)", fontWeight: 600 };

/** 축 힌트 — 팔레트 설명과 같은 말(두 곳이 다르면 사용자가 다른 물건으로 읽는다). */
const AXIS_HINT: Record<CandleAxis, string> = {
    rate: "종가 등락률(전일 UN 종가 대비 %)",
    highRate: "고가 등락률(전일 UN 종가 대비 %)",
    openHigh: "시가에서 고가까지 몇 % 갔나(가격 비 — 윗힘)",
    openLow: "시가에서 저가까지 몇 % 빠졌나(가격 비 — 아랫꼬리)",
    openClose: "시가에서 종가까지 몇 % — 양수면 양봉, 음수면 음봉",
    baseline: "종가가 확정 기준선에서 몇 % 위/아래인가(기준선 없는 차트는 결손 = 미발화)",
};

/** 표본 캔들의 기본값 — 축이 꺼져 있을 때 그림이 쓰는 자리(저장물에는 안 간다). */
const SAMPLE = { rate: 5, openClose: 1.5, openHigh: 2.5, openLow: -1, highRate: 6, baseline: 0.5 };

const fromOf = (c: CandleAxisCond | undefined, fb: number): number => c?.from ?? c?.to ?? fb;
const hasBound = (c: CandleAxisCond | undefined): boolean => c?.from !== undefined || c?.to !== undefined;

/** 드래그 문맥 — 기준(시가·종가)과 y 스케일을 pointerdown 에 얼린 것 + 커밋 전 draft. */
interface Drag {
    axis: CandleAxis;
    open: number;
    rate: number;
    mid: number;
    span: number;
    draft: CandlePred;
}

const H = 190;
const PAD = 14;
const W = 150;

export function CandleCondEditor({ at, pred, onWrite, onClose }: {
    at: { x: number; y: number };
    pred: CandlePred;
    onWrite: (next: CandlePred) => void;
    onClose: () => void;
}): JSX.Element {

    const [drag, setDrag] = useState<Drag | null>(null);
    const shown = drag?.draft ?? pred; // 그림·배지는 드래그 중 draft, 평시엔 저장물
    const axes = shown.axes;
    const wAxis = (a: CandleAxis, patch: Partial<CandleAxisCond>): void =>
        onWrite({ ...pred, axes: { ...pred.axes, [a]: { on: pred.axes[a]?.on ?? false, ...pred.axes[a], ...patch } } });

    // ── 표본 캔들의 좌표(등락률 공간) — 경계값들로 세운 그림 ──
    const rate = drag?.rate ?? fromOf(axes.rate, SAMPLE.rate);
    const oc = fromOf(axes.openClose, SAMPLE.openClose);
    const open = drag?.open ?? rate - oc; // 시가 = 종가 − 시가→종가(그림용 역산 — 드래그 중엔 얼린 값)
    const geom = {
        rate: fromOf(axes.rate, SAMPLE.rate),
        highRate: fromOf(axes.highRate, Math.max(rate, open) + 1),
        openHigh: open + fromOf(axes.openHigh, SAMPLE.openHigh),
        openLow: open + fromOf(axes.openLow, SAMPLE.openLow),
        openClose: open + oc,
        baseline: rate - fromOf(axes.baseline, SAMPLE.baseline),
    } satisfies Record<CandleAxis, number>;

    // y 스케일 — 등장하는 값 전부를 품고 여유(최소 폭 8%). 드래그 중엔 얼린 스케일(기어오름 방지 — L3).
    const values = [open, ...CANDLE_AXES.map((a) => geom[a])];
    const lo = Math.min(...values) - 1.5;
    const hi = Math.max(...values) + 1.5;
    const span = drag?.span ?? Math.max(hi - lo, 8);
    const mid = drag?.mid ?? (hi + lo) / 2;
    const yOf = (v: number): number => PAD + (H - 2 * PAD) * (1 - (v - (mid - span / 2)) / span);
    const vOf = (y: number): number => (mid - span / 2) + span * (1 - (y - PAD) / (H - 2 * PAD));

    const svgRef = useRef<SVGSVGElement>(null);
    const startDrag = (a: CandleAxis, e: React.PointerEvent): void => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDrag({ axis: a, open, rate, mid, span, draft: shown });
    };
    const onMove = (e: React.PointerEvent): void => {
        if (drag === null || svgRef.current === null) return;
        const box = svgRef.current.getBoundingClientRect();
        const v = Math.round(vOf(e.clientY - box.top) * 10) / 10;
        const a = drag.axis;
        // 축의 기준으로 되돌린다 — 전부 **얼린** 시가·종가 기준(살아 있는 값이면 역산이 꼬리를 문다).
        const rel = a === "openHigh" || a === "openLow" || a === "openClose" ? Math.round((v - drag.open) * 10) / 10
            : a === "baseline" ? Math.round((drag.rate - v) * 10) / 10
            : v;
        setDrag({ ...drag, draft: { ...drag.draft, axes: { ...drag.draft.axes, [a]: { ...drag.draft.axes[a], on: true, from: rel } } } });
    };
    const endDrag = (): void => {
        if (drag === null) return;
        onWrite(drag.draft); // 커밋은 pointerup 한 번(M4)
        setDrag(null);
    };

    const cx = 56;
    const bodyTop = yOf(Math.max(open, geom.openClose));
    const bodyBot = yOf(Math.min(open, geom.openClose));
    const bull = geom.openClose >= open;

    /** 핸들 한 벌 — 선 + 잡이 + 값 배지. 끈 축은 회색·드래그 불가("끈 컷 = 줄 흐림 + 핸들 회색"). */
    const handle = (a: CandleAxis, y: number, color: string, dash?: string): JSX.Element => {
        const cond = axes[a];
        const on = cond?.on === true;
        const c = on ? color : "var(--text-tertiary)";
        const v = a === "openHigh" || a === "openLow" || a === "openClose"
            ? fromOf(cond, a === "openClose" ? oc : a === "openHigh" ? SAMPLE.openHigh : SAMPLE.openLow)
            : a === "baseline" ? fromOf(cond, SAMPLE.baseline)
            : geom[a];
        // 켜져 있어도 경계가 없으면 조건이 아니다 — 표본값 배지는 "걸려 있다"로 읽히므로 진실을 쓴다(L2).
        const badge = on && !hasBound(cond) ? "경계 없음" : `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}`;
        return (
            <g key={a} opacity={on ? 1 : 0.45}>
                <line x1={10} x2={W - 46} y1={y} y2={y} stroke={c} strokeWidth={1} strokeDasharray={dash} />
                <circle cx={W - 46} cy={y} r={4.5} fill={c}
                    style={{ cursor: on ? "ns-resize" : "default", touchAction: "none" }}
                    onPointerDown={(e) => { if (on) startDrag(a, e); }}
                    onPointerUp={endDrag} />
                <text x={W - 38} y={y + 3} fontSize={9} fill={c}>
                    {CANDLE_AXIS_LABEL[a].replace("시가→", "→")} {badge}
                </text>
            </g>
        );
    };

    return (
        <AnchoredPopover anchor={at} onClose={onClose} role="dialog" width={452} padding="8px 12px 10px"
            placement="beside" offset={6} shiftX={-6} maxHeight="100vh" style={{ display: "flex", gap: 10 }}>
            <svg ref={svgRef} width={W} height={H} onPointerMove={onMove} onPointerUp={endDrag} onPointerLeave={endDrag}
                style={{ flexShrink: 0, background: "var(--bg-secondary)", borderRadius: 6 }}>
                {/* 표본 캔들 — 심지(고가~저가) + 몸통(시가~종가). 값이 아니라 조건의 그림이다. */}
                <line x1={cx} x2={cx} y1={yOf(geom.openHigh)} y2={yOf(geom.openLow)} stroke="var(--text-tertiary)" strokeWidth={1.5} />
                <rect x={cx - 9} width={18} y={bodyTop} height={Math.max(bodyBot - bodyTop, 2)}
                    fill={bull ? "var(--rise, #d64b4b)" : "var(--fall, #4b6bd6)"} opacity={0.85} rx={1.5} />
                {handle("highRate", yOf(geom.highRate), "var(--accent-primary)")}
                {handle("openHigh", yOf(geom.openHigh), "#c58940")}
                {handle("rate", yOf(geom.rate), "var(--rise, #d64b4b)")}
                {handle("openClose", yOf(geom.openClose), "#8459c5", "3 2")}
                {handle("openLow", yOf(geom.openLow), "#4c9a67")}
                {handle("baseline", yOf(geom.baseline), "var(--text-secondary)", "5 3")}
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", padding: "0 0 4px" }}>
                    캔들 조건 — 축마다 켜고 From·To 를 잡는다(비운 쪽 = 무제한). 핸들 드래그 = From.
                </div>
                {CANDLE_AXES.map((a) => {
                    const c = axes[a];
                    const on = c?.on === true;
                    return (
                        <div key={a} style={{ ...row, opacity: on ? 1 : 0.55 }} title={AXIS_HINT[a]}>
                            <button onClick={() => wAxis(a, { on: !on })} aria-pressed={on}
                                title={on ? "이 축 끄기(값은 남는다)" : "이 축 켜기"}
                                style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex" }}>
                                <Switch on={on} />
                            </button>
                            <span style={rowLabel}>{CANDLE_AXIS_LABEL[a]}</span>
                            <OptNumField label="" suffix="" placeholder="↓" value={c?.from ?? null}
                                title="하한(포함, %) — 비우면 아래 무제한" onCommit={(v) => wAxis(a, { from: v ?? undefined })} />
                            <span style={{ color: "var(--text-tertiary)" }}>~</span>
                            <OptNumField label="" suffix="%" placeholder="↑" value={c?.to ?? null}
                                title="상한(포함, %) — 비우면 위 무제한" onCommit={(v) => wAxis(a, { to: v ?? undefined })} />
                        </div>
                    );
                })}
            </div>
        </AnchoredPopover>
    );
}

/** ON/OFF 스위치 — 차트 「사슬」 판(ChainLayerMenu)과 같은 관용구(좌우로 미끄러지는 잡이). */
function Switch({ on }: { on: boolean }): JSX.Element {
    return (
        <span aria-hidden style={{
            width: 26, height: 14, borderRadius: 7, position: "relative", flexShrink: 0,
            background: on ? "var(--accent-primary)" : "var(--border-strong)", transition: "background 0.12s",
        }}>
            <span style={{
                position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: 5, background: "#fff",
                transition: "left 0.12s",
            }} />
        </span>
    );
}
