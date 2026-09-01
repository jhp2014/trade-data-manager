// 세션 타임라인 바 — 시각 스크럽의 손. 옛 range 슬라이더를 대체한다(2026-08-28 재편):
//   · teal 띠 = 시선 종목의 존 재적 구간(연동 행 N/M 기준) — 끊김이 곧 이탈/결손(테이프 어휘)
//   · ▼ = 타점(클릭 = 그 시각으로 점프 — 옛 ↺ 버튼의 후계)
//   · 트랙 클릭/드래그 = 스크럽(분 단위)
// 좌표는 전부 %(프랙션) — 픽셀 측정(ResizeObserver)이 필요 없다. 포인터 → 분 변환만 이벤트 시점의
// getBoundingClientRect 로 한다.
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ACTIVE, FILTER, THEME_PEER } from "../../styles/palette.js";
import type { BandSegment } from "./zoneTrack.js";

/** 트랙 좌우 여백(px) — 끝 분의 표식·라벨이 잘리지 않을 만큼(Rail 의 RAIL_PAD 와 같은 역할). */
const PAD_X = 10;

const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function TimelineBar({ lo, hi, minute, pointMinutes, segments, onScrub }: {
    lo: number;
    hi: number;
    /** 현재 분(스크럽 또는 기본 사다리) — null 이면 플레이헤드 없음. */
    minute: number | null;
    /** 타점의 분들(그 종목·그날). */
    pointMinutes: readonly number[];
    /** 존 재적 구간 — null 은 연동 행 없음(띠 없이 트랙만). */
    segments: readonly BandSegment[] | null;
    onScrub: (minute: number) => void;
}): JSX.Element {
    const span = Math.max(hi - lo, 1);
    const fracOf = (m: number): number => (Math.min(Math.max(m, lo), hi) - lo) / span;
    const at = (m: number): string => `calc(${PAD_X}px + ${fracOf(m)} * (100% - ${2 * PAD_X}px))`;

    const trackRef = useRef<HTMLDivElement | null>(null);
    const dragging = useRef(false);
    const minuteAt = (clientX: number): number => {
        const el = trackRef.current;
        if (!el) return lo;
        const rect = el.getBoundingClientRect();
        const frac = Math.min(Math.max((clientX - rect.left - PAD_X) / Math.max(rect.width - 2 * PAD_X, 1), 0), 1);
        return lo + Math.round(frac * span);
    };
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
        if (e.button !== 0) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrub(minuteAt(e.clientX));
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
        if (dragging.current) onScrub(minuteAt(e.clientX));
    };
    const onPointerUp = (): void => { dragging.current = false; };

    return (
        <div ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            title="누르거나 끌어서 시각 이동 · ▼ = 타점(클릭 = 그 시각으로)"
            style={barWrap}>
            {/* 기준 트랙 */}
            <div style={{ position: "absolute", left: PAD_X, right: PAD_X, top: TRACK_TOP, height: 4, borderRadius: 2, background: "var(--bg-tertiary)", pointerEvents: "none" }} />
            {/* 존 재적 띠 — 끊김이 이탈이다. */}
            {segments?.map((s, i) => (
                <div key={i} aria-hidden style={{
                    position: "absolute", top: TRACK_TOP, height: 4, background: THEME_PEER, pointerEvents: "none",
                    left: at(s.from), width: `calc(${Math.max(fracOf(s.to) - fracOf(s.from), 0.002)} * (100% - ${2 * PAD_X}px))`,
                }} />
            ))}
            {/* 타점 ▼ — 클릭 = 점프. 트랙의 스크럽 드래그와 안 섞이게 pointerdown 을 막는다. */}
            {pointMinutes.map((m, i) => (
                <button key={i} onPointerDown={(e) => e.stopPropagation()} onClick={() => onScrub(m)}
                    title={`타점 ${fmtMin(m)} — 클릭하면 그 시각으로`}
                    style={{ ...markerBtn, left: at(m) }}>▼</button>
            ))}
            {/* 플레이헤드 + 시각 라벨 */}
            {minute !== null && (
                <>
                    <div aria-hidden style={{ position: "absolute", left: at(minute), top: 8, bottom: 2, width: 2, background: FILTER, transform: "translateX(-50%)", pointerEvents: "none" }} />
                    <span aria-hidden style={{
                        position: "absolute", left: at(minute), top: -2, transform: "translateX(-50%)",
                        fontSize: 9.5, fontWeight: 700, padding: "0 5px", borderRadius: 3, background: FILTER, color: "#fff",
                        fontVariantNumeric: "tabular-nums", pointerEvents: "none", whiteSpace: "nowrap",
                    }}>{fmtMin(minute)}</span>
                </>
            )}
            {/* 도메인 라벨 */}
            <span style={{ ...endLabel, left: 4 }}>{fmtMin(lo)}</span>
            <span style={{ ...endLabel, right: 4 }}>{fmtMin(hi)}</span>
        </div>
    );
}

const TRACK_TOP = 15;
const barWrap: CSSProperties = {
    position: "relative", flex: 1, minWidth: 120, height: 32, cursor: "crosshair",
    userSelect: "none", WebkitUserSelect: "none", touchAction: "none",
};
const markerBtn: CSSProperties = {
    position: "absolute", top: 3, transform: "translateX(-50%)", border: "none", background: "transparent",
    padding: 0, fontSize: 9, lineHeight: 1, color: ACTIVE, cursor: "pointer",
};
const endLabel: CSSProperties = {
    position: "absolute", bottom: 0, fontSize: 9, color: "var(--text-tertiary)", pointerEvents: "none",
};
