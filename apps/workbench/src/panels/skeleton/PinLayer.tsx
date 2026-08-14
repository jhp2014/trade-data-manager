// 붙잡은 피벗의 **세로선 · 손잡이 · 판독 칩** — 값을 짚어 읽는 손짓 전부.
//
// ⚠ **그리는 순서가 규약이다**(겪은 버그): 세로선의 10px 투명 히트 영역이 피벗 손잡이보다 **뒤에** 오면
// 자기 x 에 있는 점의 클릭을 통째로 삼킨다 — 핀을 찍고 나면 못 떼던 버그가 정확히 그것이었다.
// 그래서 세로선(PinVerticals) → 손잡이(PivotHandles) 순으로 **부르는 자리가 고정**이고, 층 순서
// 테스트가 그걸 잡는다. 둘을 한 컴포넌트로 합치지 않은 건 사이에 골격선 히트라인이 끼기 때문이다.
//
// ⚠ 그림 위에서 포인터를 받는 것들(세로선·손잡이)엔 **`<title>` 을 두지 않는다**(사용자 요구):
// 값을 읽으려고 손을 올린 그 자리에 브라우저 툴팁이 떠서 판독을 가린다. 조작 안내는 푸터가 한 줄로 답한다.
import type { CSSProperties } from "react";
import { fmtEok, fmtPct } from "../../lib/format.js";
import { ACTIVE } from "../../styles/palette.js";
import { RISE_COLOR, FALL_COLOR } from "../../chart/chartUtils.js";
import { labelDot } from "./chips.js";
import type { ReadoutCandidate } from "./readout.js";
import type { OverlayLine } from "./skeletonOverlay.js";

/** 세로선과 칩 사이 거리(화면 px) — 떨어질수록 지시선이 대응을 더 잘 진다(사용자 요구로 10 → 30). */
export const READOUT_OFFSET = 30;

interface Box { left: number; top: number; width: number; height: number }
interface Scales { x: (v: number) => number; y: (v: number) => number }

/**
 * 붙잡은 피벗의 세로선 — 테마 값을 펼치는 **손잡이**다. 올리면 그 시각의 테마 값이 선 오른쪽에 펴진다
 * (상시가 아니라 호버 중에만 — 30줄이 늘 떠 있으면 화면이 찬다).
 * 보이는 선은 얇지만 히트 영역은 넓은 투명 선이 따로 받는다(1px 을 겨냥할 수는 없다).
 */
export function PinVerticals({ xs, openX, scales, box, onHover }: {
    xs: readonly number[];
    openX: number | null;
    scales: Scales;
    box: Box;
    onHover: (x: number | null) => void;
}): JSX.Element {
    return (
        <g data-layer="pin-verticals">
            {xs.map((m) => {
                const x = scales.x(m);
                const open = openX === m;
                return (
                    <g key={`pinv-${m}`}>
                        <line x1={x} x2={x} y1={box.top} y2={box.top + box.height}
                            stroke={open ? ACTIVE : "var(--text-tertiary)"} strokeWidth={open ? 1.2 : 0.8} strokeDasharray="2 3"
                            opacity={open ? 0.9 : 0.5} style={{ pointerEvents: "none" }} />
                        <line x1={x} x2={x} y1={box.top} y2={box.top + box.height} stroke="transparent" strokeWidth={10}
                            style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                            onMouseEnter={() => onHover(m)} onMouseLeave={() => onHover(null)} />
                    </g>
                );
            })}
        </g>
    );
}

/**
 * 피벗 손잡이 — 포인터를 받는 건 **조사 중인 골격 + 값을 붙잡아 둔 골격**의 점들뿐이다(선은 여전히
 * 순수 그림). 한두 벌뿐이라 뭉쳐서 못 겨냥하는 문제가 없다.
 *
 * 핀이 걸린 선까지 넣는 이유: 그 선을 떠난 뒤에도 값이 남는데 손잡이가 사라지면 **뗄 수가 없다**.
 * 들어올 때 선 호버도 같이 켠다 — 라벨에서 손이 떠나 조사 대상이 바뀌면 점이 사라져 못 짚는다.
 * **맨 위에 그린다** — 위 세로선·아래 선들 어느 것도 이 손잡이를 가리면 안 된다.
 */
export function PivotHandles({ lines, scales, onToggle, onHover }: {
    lines: readonly OverlayLine[];
    scales: Scales;
    onToggle: (key: string, i: number) => void;
    onHover: (at: { key: string; i: number } | null) => void;
}): JSX.Element {
    return (
        <g data-layer="pivot-handles">
            {lines.map((s) =>
                // 원점도 분봉에선 손잡이를 받는다(사용자 확정) — 호버 = t₀의 테마 값, 클릭 = 핀 세로선.
                s.points.map((p, i) => (s.kind !== "point" && p.x === 0 && p.y === 0 ? null : (
                    <circle key={`hit-${s.key}-${i}`} cx={scales.x(p.x)} cy={scales.y(p.y)} r={7} fill="transparent"
                        style={{ pointerEvents: "auto", cursor: "pointer" }}
                        onClick={() => onToggle(s.key, i)}
                        onMouseEnter={() => onHover({ key: s.key, i })}
                        onMouseLeave={() => onHover(null)} />
                ))),
            )}
        </g>
    );
}

/**
 * 핀 시각의 판독 — **크로스헤어 판독과 같은 모양**으로 통일했다(사용자 확정).
 * 옛 열 쌓기는 겹칠수록 오른쪽으로 번져 화면을 넘었고, "어느 시각 것이냐"를 열로 읽는 규칙을 따로
 * 배워야 했다. 지시선이 이미 대응을 지므로 **한 열에서 위아래로** 벌리면 그만이다.
 */
export function PinReadout({ rows, x, scales, colorOf }: {
    rows: readonly { item: ReadoutCandidate; labelY: number; off: "up" | "down" | null }[];
    /** 펼쳐 보는 x(뷰 공간). */
    x: number;
    scales: Scales;
    colorOf: (code: string) => string;
}): JSX.Element {
    return (
        <div data-layer="pin-readout" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            {rows.map((s) => (
                <div key={`trl-${s.item.code}`} style={{
                    ...readoutBox, left: scales.x(x) + READOUT_OFFSET, top: s.labelY,
                    transform: "translateY(-50%)",
                    borderColor: s.item.own ? ACTIVE : "var(--border-default)",
                    fontWeight: s.item.own ? 500 : 400,
                }}>
                    <span style={labelDot(colorOf(s.item.code))} />
                    <span>{s.item.name}</span>
                    {s.off && <span style={{ color: "var(--text-tertiary)" }}>{s.off === "up" ? "▲" : "▼"}</span>}
                    <span style={{ color: s.item.pct >= 0 ? RISE_COLOR : FALL_COLOR }}>{fmtPct(s.item.pct)}</span>
                    {s.item.amount !== null && <span style={{ color: "var(--text-secondary)" }}>{fmtEok(s.item.amount)}</span>}
                </div>
            ))}
        </div>
    );
}

/** 선 판독 상자 — 얽힌 선 위에 뜨므로 불투명 배경(반투명이면 뒤 선이 글자를 뚫고 올라온다). */
export const readoutBox: CSSProperties = {
    position: "absolute", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
    fontSize: 10, lineHeight: "15px", fontVariantNumeric: "tabular-nums",
    color: "var(--text-primary)", background: "var(--bg-secondary)", border: "1px solid var(--border-default)",
    borderRadius: 4, padding: "1px 6px", boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
};
