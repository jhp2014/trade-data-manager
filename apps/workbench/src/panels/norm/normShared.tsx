// 정규화 패널 공용 조각 — 고정 슬롯 영속 파서 + 고정 칩 줄. 두 패널(일봉·타점)의 항목 타입만 다르고
// 슬롯 규칙은 같다: **시선 1(focus 자동 교체) + 고정 N(명시 등록, 시선이 바뀌어도 유지·자동 리셋 없음)**.
import type { CSSProperties } from "react";

/** 고정 항목 — time 없으면 차트(일봉 패널), 있으면 타점(타점 패널). */
export interface NormPin {
    code: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM:SS
}

export const pinKey = (p: NormPin): string => `${p.code}|${p.date}${p.time ? `|${p.time}` : ""}`;

/** localStorage 파서 — 모양이 어긋난 항목은 통째로 버린다(부분 복원이 더 헷갈린다). */
export function parsePins(raw: unknown): NormPin[] | null {
    if (!Array.isArray(raw)) return null;
    const ok = raw.every(
        (p): p is NormPin =>
            typeof p === "object" && p !== null &&
            typeof (p as NormPin).code === "string" &&
            typeof (p as NormPin).date === "string" &&
            ((p as NormPin).time === undefined || typeof (p as NormPin).time === "string"),
    );
    return ok ? (raw as NormPin[]) : null;
}

/** 고정 칩 한 줄 — 색 점 + 라벨 + ✕. 시선과 겹치는 고정은 패널이 emphasized 색으로 알려준다. */
export function PinChips({ pins, labelOf, colorOf, onRemove }: {
    pins: readonly NormPin[];
    labelOf: (p: NormPin) => string;
    colorOf: (p: NormPin) => string;
    onRemove: (key: string) => void;
}): JSX.Element | null {
    if (pins.length === 0) return null;
    return (
        <div style={chipRow}>
            {pins.map((p) => {
                const k = pinKey(p);
                return (
                    <span key={k} style={chip}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: colorOf(p), flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(p)}</span>
                        <button onClick={() => onRemove(k)} title="고정 해제" style={chipX}>×</button>
                    </span>
                );
            })}
        </div>
    );
}

const chipRow: CSSProperties = {
    display: "flex", flexWrap: "wrap", gap: 4, padding: "3px 8px",
    borderBottom: "1px solid var(--border-subtle)", fontSize: 11,
};
const chip: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, maxWidth: 180,
    padding: "1px 3px 1px 7px", borderRadius: 9, border: "1px solid var(--border-default)",
    background: "var(--bg-secondary)", color: "var(--text-primary)",
};
const chipX: CSSProperties = {
    border: "none", background: "none", cursor: "pointer", padding: "0 3px",
    fontSize: 12, lineHeight: 1, color: "var(--text-tertiary)",
};
