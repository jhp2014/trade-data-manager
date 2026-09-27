// 양끝 선택 구간 입력 `[하한] ~ [상한]` — 두 칸은 **초안**이고, 둘 다 읽히고 순서가 맞을 때만 한 번에 커밋한다
// (Enter/blur). 빈칸 = 그쪽 무제한, 양끝 다 빈 커밋은 거절(조건을 빼는 손은 따로 있다: 체크·칩 지우기).
// 틀리면 조용히 고치지 않고 빨갛게 남긴다 — 칸마다 따로 커밋하며 뒤집으면 앞 칸부터 고치는 중간 상태
// (예: 상한 2 에서 하한 3 입력)가 2~3 으로 뒤집혀 들어가 버린다(2026-09-27 리뷰 지적).
// 쓰는 곳: 테마 조건 컷·등락 값, 사슬 필터 칩 범위. 시각 구간은 문자열이라 사슬 필터 TimeRangesField 가 따로 든다.
import { useEffect, useState } from "react";

export interface OptRange {
    min?: number;
    max?: number;
}

const txt = (v: number | undefined): string => (v === undefined ? "" : String(v));

export function RangePair({ value, onCommit, unit, int, floor, dim }: {
    value: OptRange;
    onCommit: (r: OptRange) => void;
    unit?: string;
    /** 정수만(반올림). */
    int?: boolean;
    /** 허용 최솟값(이보다 작으면 틀림). */
    floor?: number;
    /** 끈 컷 — 흐리게(값은 여전히 고칠 수 있다: 다시 켤 때 제자리). */
    dim?: boolean;
}): JSX.Element {
    const [lo, setLo] = useState(txt(value.min));
    const [hi, setHi] = useState(txt(value.max));
    useEffect(() => { setLo(txt(value.min)); setHi(txt(value.max)); }, [value.min, value.max]);

    const read = (s: string): number | undefined | null => {
        if (s.trim() === "") return undefined;
        const n = Number(s);
        if (!Number.isFinite(n)) return null;
        const v = int ? Math.round(n) : Math.round(n * 100) / 100;
        return floor !== undefined && v < floor ? null : v;
    };
    const a = read(lo);
    const b = read(hi);
    const bad = a === null || b === null || (a !== undefined && b !== undefined && a > b) || (a === undefined && b === undefined);

    const commit = (): void => {
        if (bad) return;
        if (a === value.min && b === value.max) { setLo(txt(a)); setHi(txt(b)); return; } // 표기만 다듬는다
        onCommit({ ...(a !== undefined ? { min: a } : {}), ...(b !== undefined ? { max: b } : {}) });
    };
    const field = (v: string, set: (s: string) => void, ph: string, label: string): JSX.Element => (
        <input value={v} placeholder={ph} inputMode="decimal" aria-label={label} aria-invalid={bad || undefined}
            onChange={(e) => set(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            style={{
                width: 40, fontSize: 11, padding: "1px 3px", borderRadius: 3, textAlign: "right", fontVariantNumeric: "tabular-nums",
                border: `1px solid ${bad ? "var(--rise)" : "var(--border-default)"}`,
                background: "var(--bg-primary)", color: dim ? "var(--text-tertiary)" : "var(--text-primary)",
            }} />
    );
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
            title={bad ? "하한 ≤ 상한인 수로 — 맞을 때까지 커밋하지 않는다" : undefined}>
            {field(lo, setLo, "하한", "하한")}
            <span style={{ color: "var(--text-tertiary)" }}>~</span>
            {field(hi, setHi, "상한", "상한")}
            {unit && <span style={{ color: "var(--text-tertiary)" }}>{unit}</span>}
        </span>
    );
}
