// 순위 레일의 시각 어휘 — 배치 레인(축)과 날짜·시간 필터 레일이 **같은 언어**로 보이게 하는 조각들.
// 얇은 2px 라인 · 양 끝 −/+ 스케일 마커 · 수직 틱 · 현재 위치 물방울 핀 · 필터 경계 대괄호.
// 두 레일이 이걸 공유하지 않으면 "같은 축인데 다르게 생긴" 화면이 된다.
import type { CSSProperties } from "react";
import { LINE_PAD, PAD } from "./rankGeometry.js";
import { FILTER } from "../../styles/palette.js";

// 색은 styles/palette 단일 출처 — 레인·필터레일·시트·경계메뉴가 같은 값을 보게 재노출만 한다.
export { ACTIVE, ACTIVE_SOFT, HOVER, HOVER_SOFT, FILTER } from "../../styles/palette.js";
export const LABEL_W = 138; // 레일 좌측 라벨 열 폭 — 축 레인과 필터 레일이 같은 열에 정렬되게.

export function CurrentMarker({ color }: { color: string }): JSX.Element {
    return (
        <span className="rank-cur-pin" aria-hidden style={{ position: "absolute", left: "50%", bottom: "calc(100% + 3px)", width: 16, height: 21, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 6 }}>
            <svg width="16" height="21" viewBox="0 0 26 34">
                <path d="M13 3.6 C7.5 3.6 3.6 8 3.6 12.6 C3.6 18.4 13 30.4 13 30.4 C13 30.4 22.4 18.4 22.4 12.6 C22.4 8 18.5 3.6 13 3.6 Z" fill={color} />
                <circle cx="13" cy="12.4" r="4.4" fill="var(--bg-primary)" />
            </svg>
        </span>
    );
}
// 정렬 배지 — 시트에서 이 레일이 정렬 기준일 때 라벨 옆에 세련되게. 방향(강↑/약↓) 화살표.
export function SortBadge({ dir }: { dir: 1 | -1 }): JSX.Element {
    return (
        <span title="시트 정렬 기준" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, height: 15, padding: "0 5px", borderRadius: 7, background: "var(--accent-soft)", color: "var(--accent-primary)", fontSize: 9, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1 }}>
            정렬 <span style={{ fontSize: 8 }}>{dir === 1 ? "▲" : "▼"}</span>
        </span>
    );
}
// 끝 스케일 마커 — 라인 양 끝의 수직 눈금선(|) + 아래 −/+ 라벨(스케일 숫자처럼).
export function ScaleEnd({ side }: { side: "left" | "right" }): JSX.Element {
    const isL = side === "left";
    const anchor: CSSProperties = isL ? { left: LINE_PAD, transform: "translateX(-50%)" } : { right: LINE_PAD, transform: "translateX(50%)" };
    return (
        <>
            <span style={{ position: "absolute", top: "50%", marginTop: -6.5, width: 2, height: 13, background: "var(--text-tertiary)", ...anchor }} />
            <span style={{ position: "absolute", top: "calc(50% + 8px)", fontSize: 13, fontWeight: 700, lineHeight: 1, color: "var(--text-tertiary)", ...anchor }}>{isL ? "−" : "+"}</span>
        </>
    );
}

// 필터 범위 괄호 — 경계 spot 바깥으로 살짝 벗어난 대괄호([ = 이상 경계 / ] = 이하 경계). spot과 겹치지 않게.
export function RangeBracket({ u, side, pad = PAD }: { u: number; side: "open" | "close"; pad?: number }): JSX.Element {
    const pos = `calc(${pad}px + ${u} * (100% - ${2 * pad}px))`;
    const common: CSSProperties = {
        position: "absolute", top: "50%", transform: "translateY(-50%)", width: 6, height: 20,
        border: `2px solid ${FILTER}`, pointerEvents: "none", zIndex: 5,
    };
    return side === "open"
        ? <span style={{ ...common, left: `calc(${pos} - 14px)`, borderRight: "none", borderRadius: "2px 0 0 2px" }} />
        : <span style={{ ...common, left: `calc(${pos} + 8px)`, borderLeft: "none", borderRadius: "0 2px 2px 0" }} />;
}

