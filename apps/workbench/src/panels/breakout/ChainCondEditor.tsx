// 사슬 필터 칩의 **아랫줄 편집면** — 값만 맡는다(구조 — NOT·괄호·연산자 — 는 줄의 우클릭이 맡는다: 조건판과 같은 가름).
// 조건 값 + 그 칩의 순번(전부 / 처음 K).
import { useEffect, useState } from "react";
import type { ChainCond, ChainTerm, ChainTimeRange } from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import { RangePair } from "../../components/RangePair.js";
import { parseTime } from "../../lib/date.js";
import { parseRangeRow } from "../filter/RangeTextEditor.js";
import { COND_HINT, COND_NAME } from "./chainChecks.js";
import { RankPick } from "./ChainExprRow.js";

export function ChainCondEditor({ term, onChange }: { term: ChainTerm; onChange: (next: ChainTerm) => void }): JSX.Element {
    const c = term.cond;
    const setCond = (cond: ChainCond): void => onChange({ ...term, cond });
    return (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px", padding: "4px 8px", fontSize: 11, background: "var(--bg-secondary)", borderRadius: 4 }}>
            <span title={COND_HINT[c.kind]} style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{COND_NAME[c.kind]}</span>
            {c.kind === "pos" && <RangePair value={c} unit="봉" int floor={0} onCommit={(r) => setCond({ kind: "pos", ...r })} />}
            {c.kind === "openHigh" && <RangePair value={c} unit="%" onCommit={(r) => setCond({ kind: "openHigh", ...r })} />}
            {c.kind === "openClose" && <RangePair value={c} unit="%" onCommit={(r) => setCond({ kind: "openClose", ...r })} />}
            {c.kind === "amount" && (
                <NumField label="≥" suffix="억" value={c.minEok} min={0}
                    normalize={(v) => Math.max(0.1, v)} onCommit={(v) => setCond({ kind: "amount", minEok: v })} />
            )}
            {c.kind === "label" && (
                <Seg options={[["baseline", "기준선 돌파"], ["high", "고가 돌파"]]} value={c.label}
                    onPick={(v) => setCond({ kind: "label", label: v })} />
            )}
            {c.kind === "time" && <TimeRangesField value={c.ranges} onCommit={(ranges) => setCond({ kind: "time", ranges })} />}
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

/**
 * 시각 구간 여럿(구간끼리 OR) — 칸은 **초안**이고, 모든 줄이 읽히고 순서가 맞을 때만 통째로 커밋한다(Enter/blur).
 * 판정은 생성소 시각 편집기와 한 벌(`parseRangeRow`) — 뒤집힌 구간을 조용히 뒤집지 않고 빨갛게 남긴다
 * (앞 칸부터 고치는 중간 상태 09:02~15:20 이 뒤집혀 커밋되면 장 전체가 줄 서기에서 빠진다 — 리뷰 지적).
 * 마지막 한 구간은 못 뺀다(조건을 빼려면 칩 우클릭 → 지우기 — RangeField 와 같은 규칙).
 */
function TimeRangesField({ value, onCommit }: { value: readonly ChainTimeRange[]; onCommit: (r: ChainTimeRange[]) => void }): JSX.Element {
    const [rows, setRows] = useState<ChainTimeRange[]>(() => value.map((r) => ({ ...r })));
    // 커밋된 값이 바뀌면 초안을 맞춘다 — 커밋 못 한(빨간) 초안이 있는 동안엔 value 가 안 바뀌어 초안이 산다.
    useEffect(() => setRows(value.map((r) => ({ ...r }))), [value]);
    const parsed = rows.map((r) => parseRangeRow(r, parseTime, false));
    /** 전부 읽히면 표준형으로 커밋(바뀐 게 있을 때만) — 하나라도 틀리면 초안만 남긴다. */
    const commit = (next: ChainTimeRange[] = rows): void => {
        const ps = next.map((r) => parseRangeRow(r, parseTime, false));
        if (ps.length === 0 || !ps.every((p) => p.valid)) return;
        const out = ps.map((p) => ({ from: p.from!, to: p.to! }));
        if (out.length === value.length && out.every((r, i) => r.from === value[i]!.from && r.to === value[i]!.to)) {
            setRows(out); // 표기만 다듬는다(8:00 → 08:00)
            return;
        }
        onCommit(out);
    };
    const setCell = (i: number, side: "from" | "to", v: string): void => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [side]: v } : r)));
    const btn = { fontSize: 10.5, padding: "0 5px", border: "none", background: "transparent", cursor: "pointer", color: "var(--text-tertiary)", lineHeight: "16px" } as const;
    const field = (i: number, side: "from" | "to", bad: boolean): JSX.Element => (
        <input value={rows[i]![side]} placeholder="HH:MM" aria-label="시각" aria-invalid={bad || undefined}
            onChange={(e) => setCell(i, side, e.target.value)} onBlur={() => commit()} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            style={{
                width: 42, fontSize: 11, padding: "1px 3px", borderRadius: 3, fontVariantNumeric: "tabular-nums",
                border: `1px solid ${bad ? "var(--rise)" : "var(--border-default)"}`,
                background: "var(--bg-primary)", color: "var(--text-primary)",
            }} />
    );
    return (
        <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px" }}>
            {rows.map((_, i) => {
                const bad = !parsed[i]!.valid;
                return (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                        title={bad ? "HH:MM ~ HH:MM, 앞이 뒤보다 늦지 않게 — 맞을 때까지 커밋하지 않는다" : undefined}>
                        {field(i, "from", bad)}
                        <span style={{ color: "var(--text-tertiary)" }}>~</span>
                        {field(i, "to", bad)}
                        {rows.length > 1 && (
                            <button aria-label="구간 빼기" title="이 구간 빼기" style={btn}
                                onClick={() => { const next = rows.filter((_, k) => k !== i); setRows(next); commit(next); }}>×</button>
                        )}
                    </span>
                );
            })}
            <button title="구간 더하기(구간끼리 OR) — 마지막 구간을 복사해 연다" style={{ ...btn, border: "1px dashed var(--border-strong)", borderRadius: 8 }}
                onClick={() => {
                    const last = value[value.length - 1];
                    onCommit([...value, last ? { ...last } : { from: "09:00", to: "09:02" }]);
                }}>
                ＋ 구간
            </button>
        </span>
    );
}
