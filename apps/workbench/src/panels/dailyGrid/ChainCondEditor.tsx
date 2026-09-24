// 사슬 필터 칩의 **아랫줄 편집면** — 값만 맡는다(구조 — NOT·괄호·연산자 — 는 줄의 우클릭이 맡는다: 생성소와 같은 가름).
// 조건 값 + 그 칩의 순번(전부 / 처음 K).
import { useEffect, useState } from "react";
import type { ChainCond, ChainRange, ChainTerm } from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import { COND_HINT, COND_NAME } from "./chainChecks.js";
import { RankPick } from "./ChainExprRow.js";

export function ChainCondEditor({ term, onChange }: { term: ChainTerm; onChange: (next: ChainTerm) => void }): JSX.Element {
    const c = term.cond;
    const setCond = (cond: ChainCond): void => onChange({ ...term, cond });
    return (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px", padding: "4px 8px", fontSize: 11, background: "var(--bg-secondary)", borderRadius: 4 }}>
            <span title={COND_HINT[c.kind]} style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{COND_NAME[c.kind]}</span>
            {c.kind === "pos" && <RangeField value={c} unit="봉" int onCommit={(r) => setCond({ kind: "pos", ...r })} />}
            {c.kind === "openHigh" && <RangeField value={c} unit="%" onCommit={(r) => setCond({ kind: "openHigh", ...r })} />}
            {c.kind === "openClose" && <RangeField value={c} unit="%" onCommit={(r) => setCond({ kind: "openClose", ...r })} />}
            {c.kind === "amount" && (
                <NumField label="≥" suffix="억" value={c.minEok} min={0}
                    normalize={(v) => Math.max(0.1, v)} onCommit={(v) => setCond({ kind: "amount", minEok: v })} />
            )}
            {c.kind === "label" && (
                <Seg options={[["baseline", "기준선 돌파"], ["high", "고가 돌파"]]} value={c.label}
                    onPick={(v) => setCond({ kind: "label", label: v })} />
            )}
            {c.kind === "sessionHigh" && <span style={{ color: "var(--text-tertiary)" }} title="아님은 칩 우클릭 → NOT">값 없음</span>}
            <RankPick value={term.firstK}
                onChange={(k) => {
                    const { firstK: _drop, ...rest } = term;
                    onChange(k === undefined ? rest : { ...rest, firstK: k });
                }} />
        </div>
    );
}

function Seg<T extends string>({ options, value, onPick }: {
    options: readonly (readonly [T, string])[];
    value: T;
    onPick: (v: T) => void;
}): JSX.Element {
    return (
        <span style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {options.map(([v, text]) => (
                <button key={v} onClick={() => onPick(v)}
                    style={{
                        fontSize: 10.5, padding: "0 8px", border: "none", cursor: "pointer", lineHeight: "18px",
                        background: v === value ? "var(--accent-soft)" : "transparent",
                        color: v === value ? "var(--accent-primary)" : "var(--text-tertiary)",
                    }}>
                    {text}
                </button>
            ))}
        </span>
    );
}

/** 양끝 선택 구간 — 빈칸 = 그쪽 무제한. 둘 다 비우면 커밋하지 않는다(조건을 빼려면 칩 우클릭 → 지우기). */
function RangeField({ value, unit, int, onCommit }: {
    value: ChainRange;
    unit: string;
    int?: boolean;
    /** 양끝이 다 빈 구간은 여기 안 온다(RangeField 가 거절하고 칸을 되돌린다). */
    onCommit: (r: ChainRange) => void;
}): JSX.Element {
    const fix = (v: number): number => (int ? Math.max(0, Math.round(v)) : v);
    const commitSide = (side: "min" | "max", v: number | undefined): boolean => {
        const next: ChainRange = { ...(value.min !== undefined ? { min: value.min } : {}), ...(value.max !== undefined ? { max: value.max } : {}) };
        if (v === undefined) delete next[side];
        else next[side] = v;
        if (next.min !== undefined && next.max !== undefined && next.min > next.max) [next.min, next.max] = [next.max, next.min];
        if (next.min === undefined && next.max === undefined) return false; // 조건을 빼려면 칩 우클릭 → 지우기
        onCommit(next);
        return true;
    };
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <OptNum value={value.min} normalize={fix} onCommit={(v) => commitSide("min", v)} placeholder="하한" />
            <span style={{ color: "var(--text-tertiary)" }}>~</span>
            <OptNum value={value.max} normalize={fix} onCommit={(v) => commitSide("max", v)} placeholder="상한" />
            <span style={{ color: "var(--text-tertiary)" }}>{unit}</span>
        </span>
    );
}

/** 비울 수 있는 숫자칸(음수 허용). Enter/blur 커밋. */
function OptNum({ value, onCommit, placeholder, normalize }: {
    value: number | undefined;
    /** false 를 돌려주면 거절 — 칸이 원래 값으로 돌아온다(값이 안 바뀌면 effect 가 안 돌아 초안이 남는다). */
    onCommit: (v: number | undefined) => boolean;
    placeholder: string;
    normalize?: (v: number) => number;
}): JSX.Element {
    const [draft, setDraft] = useState(value === undefined ? "" : String(value));
    useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
    const restore = (): void => setDraft(value === undefined ? "" : String(value));
    const commit = (): void => {
        if (draft.trim() === "") { if (value !== undefined && !onCommit(undefined)) restore(); return; }
        const raw = Number(draft);
        if (!Number.isFinite(raw)) { restore(); return; }
        const v = normalize ? normalize(raw) : raw;
        setDraft(String(v));
        if (v !== value && !onCommit(v)) restore();
    };
    return (
        <input value={draft} placeholder={placeholder} inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            style={{
                width: 44, fontSize: 11, padding: "1px 3px", border: "1px solid var(--border-default)", borderRadius: 3,
                background: "var(--bg-primary)", color: "var(--text-primary)",
            }} />
    );
}
