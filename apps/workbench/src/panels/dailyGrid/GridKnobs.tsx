// 격자판 노브 — 「돌파」 술어 하나를 **층 배지**(①격자 ②사슬 ③사슬 필터)로 나눠 편집한다. 층 배지는 그림
// (밴드 = ①, 띠 = ②, ▼·레인 = ③)과 수 줄에도 같은 번호로 붙어 "이 값이 무엇을 바꾸나"를 잇는다.
// 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」.
//
// 사슬 필터 봉 조건은 「＋ 사슬 필터」로 더하고 × 로 뺀다 — 없는 조건 = 무관. 이름표(술어 `label`)도 봉
// 조건의 하나로 여기 산다(순번 셈 앞에 걸린다).
import { useEffect, useRef, useState } from "react";
import {
    BREAKOUT_BAND_MAX_PCT,
    BREAKOUT_ZIGZAG_MAX_PCT,
    BREAKOUT_ZIGZAG_MIN_PCT,
    CHAIN_CHECKS,
    CHAIN_FIRST_K_MAX,
    activeChecksOf,
    type CellPredicate,
    type ChainCheck,
    type ChainFilter,
    type ChainRange,
} from "@trade-data-manager/market/domain";
import { NumField } from "../../components/NumField.js";
import { CHECK_HINT, CHECK_NAME } from "./chainChecks.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

export const LAYER = { grid: "①", chain: "②", filter: "③" } as const;

export function LayerBadge({ n, text, title }: { n: string; text: string; title?: string }): JSX.Element {
    return (
        <span title={title} style={{
            display: "inline-block", minWidth: 68, fontSize: 10.5, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap",
        }}>
            <span style={{ color: "var(--accent-primary)" }}>{n}</span> {text}
        </span>
    );
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 조건을 새로 걸 때의 첫 값 — 걸자마자 무언가를 거르도록(빈 조건은 파서가 지운다). */
function withCheck(p: BreakoutPred, c: ChainCheck): BreakoutPred {
    const f = p.chain;
    switch (c) {
        case "pos": return { ...p, chain: { ...f, pos: { max: 10 } } };
        case "amount": return { ...p, chain: { ...f, amountEok: 50 } };
        case "openHigh": return { ...p, chain: { ...f, openHigh: { min: 1 } } };
        case "openClose": return { ...p, chain: { ...f, openClose: { min: 0 } } };
        case "sessionHigh": return { ...p, chain: { ...f, sessionHigh: "yes" } };
        case "label": return { ...p, label: "baseline" };
    }
}

/** 조건 빼기 — 키째 지운다(undefined 로 남기면 저장물·키가 흔들린다). */
function withoutCheck(p: BreakoutPred, c: ChainCheck): BreakoutPred {
    if (c === "label") return { ...p, label: "all" };
    const key = ({ pos: "pos", amount: "amountEok", openHigh: "openHigh", openClose: "openClose", sessionHigh: "sessionHigh" } as const)[c];
    const { [key]: _gone, ...rest } = p.chain;
    return { ...p, chain: rest as ChainFilter };
}

export function GridKnobs({ p, onChange }: { p: BreakoutPred; onChange: (next: BreakoutPred) => void }): JSX.Element {
    const active = activeChecksOf(p.chain, p.label);
    const inactive = CHAIN_CHECKS.filter((c) => !active.includes(c));
    const setChain = (patch: Partial<ChainFilter>): void => onChange({ ...p, chain: { ...p.chain, ...patch } });
    const row = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", minHeight: 20 } as const;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11 }}>
            <div style={row}>
                <LayerBadge n={LAYER.grid} text="격자" title="러닝 고가 밴드·기준선 밴드 — 밴드에 닿거나 넘으면 사건" />
                <NumField label="밴드" suffix="%" value={p.bandPct} min={0}
                    title={`고가(와 기준선) 아래 이 폭 안에 닿으면 사건(0~${BREAKOUT_BAND_MAX_PCT}%)`}
                    normalize={(v) => clamp(v, 0, BREAKOUT_BAND_MAX_PCT)} onCommit={(v) => onChange({ ...p, bandPct: v })} />
                <Hint>그림의 실선(상단)·점선(하단)</Hint>
            </div>
            <div style={row}>
                <LayerBadge n={LAYER.chain} text="사슬" title="사건에서 시작해, 사슬 고점에서 zigzag 만큼 눌리면 끝" />
                <NumField label="zigzag" suffix="%" value={p.zigzagPct} min={BREAKOUT_ZIGZAG_MIN_PCT}
                    title={`사슬 끝 — 사슬 고점에서 이만큼 눌리면 끝(${BREAKOUT_ZIGZAG_MIN_PCT}~${BREAKOUT_ZIGZAG_MAX_PCT}%)`}
                    normalize={(v) => clamp(v, BREAKOUT_ZIGZAG_MIN_PCT, BREAKOUT_ZIGZAG_MAX_PCT)}
                    onCommit={(v) => onChange({ ...p, zigzagPct: v })} />
                <Hint>그림의 띠 = 사슬 하나 · 후보 = 사슬 안 봉</Hint>
            </div>
            <div style={row}>
                <LayerBadge n={LAYER.filter} text="사슬 필터" title="봉 조건을 모두 통과한 봉 중 사슬 안 순번으로 고른다" />
                <span style={{ color: "var(--text-secondary)" }}>순번</span>
                <Seg options={[["first", "처음"], ["all", "전부"]]} value={p.chain.firstK === null ? "all" : "first"}
                    title="봉 조건을 통과한 봉 중 사슬마다 처음 K개 / 전부"
                    onPick={(v) => {
                        if ((v === "all") === (p.chain.firstK === null)) return; // 이미 그 칸 — K 를 1로 되돌리지 않는다
                        setChain({ firstK: v === "all" ? null : 1 });
                    }} />
                {p.chain.firstK !== null && (
                    <NumField label="" suffix="개" value={p.chain.firstK} min={1}
                        title={`사슬마다 처음 몇 개(1~${CHAIN_FIRST_K_MAX})`}
                        normalize={(v) => clamp(Math.round(v), 1, CHAIN_FIRST_K_MAX)} onCommit={(v) => setChain({ firstK: v })} />
                )}
                <AddMenu options={inactive} onPick={(c) => onChange(withCheck(p, c))} />
            </div>
            {active.map((c) => (
                <div key={c} style={{ ...row, paddingLeft: 20 }}>
                    <span title={CHECK_HINT[c]} style={{ minWidth: 60, color: "var(--text-secondary)" }}>{CHECK_NAME[c]}</span>
                    <CheckEditor c={c} p={p} onChange={onChange} />
                    <button onClick={() => onChange(withoutCheck(p, c))} title="이 조건 빼기"
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 12, padding: "0 2px" }}>
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}

function CheckEditor({ c, p, onChange }: { c: ChainCheck; p: BreakoutPred; onChange: (next: BreakoutPred) => void }): JSX.Element {
    const f = p.chain;
    const setRange = (key: "pos" | "openHigh" | "openClose", r: ChainRange | undefined): void => {
        if (r === undefined) onChange(withoutCheck(p, key));
        else onChange({ ...p, chain: { ...f, [key]: r } });
    };
    switch (c) {
        case "pos":
            return <RangeField value={f.pos} unit="봉" int onCommit={(r) => setRange("pos", r)} />;
        case "openHigh":
            return <RangeField value={f.openHigh} unit="%" onCommit={(r) => setRange("openHigh", r)} />;
        case "openClose":
            return <RangeField value={f.openClose} unit="%" onCommit={(r) => setRange("openClose", r)} />;
        case "amount":
            return (
                <NumField label="≥" suffix="억" value={f.amountEok ?? 0} min={0}
                    normalize={(v) => Math.max(0, v)}
                    onCommit={(v) => onChange(v > 0 ? { ...p, chain: { ...f, amountEok: v } } : withoutCheck(p, "amount"))} />
            );
        case "sessionHigh":
            return (
                <Seg options={[["yes", "돌파만"], ["no", "아님"]]} value={f.sessionHigh ?? "yes"} title={CHECK_HINT.sessionHigh}
                    onPick={(v) => onChange({ ...p, chain: { ...f, sessionHigh: v } })} />
            );
        case "label":
            return (
                <Seg options={[["baseline", "기준선 돌파"], ["high", "고가 돌파"]]} value={p.label === "high" ? "high" : "baseline"} title={CHECK_HINT.label}
                    onPick={(v) => onChange({ ...p, label: v })} />
            );
    }
}

function Hint({ children }: { children: React.ReactNode }): JSX.Element {
    return <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{children}</span>;
}

function Seg<T extends string>({ options, value, onPick, title }: {
    options: readonly (readonly [T, string])[];
    value: T;
    onPick: (v: T) => void;
    title?: string;
}): JSX.Element {
    return (
        <span title={title} style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {options.map(([v, text]) => (
                <button key={v} onClick={() => onPick(v)}
                    style={{
                        fontSize: 10, padding: "0 7px", border: "none", cursor: "pointer",
                        background: v === value ? "var(--accent-soft)" : "transparent",
                        color: v === value ? "var(--accent-primary)" : "var(--text-tertiary)",
                    }}>
                    {text}
                </button>
            ))}
        </span>
    );
}

/** 양끝 선택 구간 — 빈칸 = 그쪽 무제한, 둘 다 비우면 조건 빼기(undefined 커밋). Enter/blur 커밋. */
function RangeField({ value, unit, int, onCommit }: {
    value: ChainRange | undefined;
    unit: string;
    int?: boolean;
    onCommit: (r: ChainRange | undefined) => void;
}): JSX.Element {
    const fix = (v: number): number => (int ? Math.max(0, Math.round(v)) : v);
    const commitSide = (side: "min" | "max", v: number | undefined): void => {
        const next: ChainRange = { ...value };
        if (v === undefined) delete next[side];
        else next[side] = v;
        // 하한 > 상한은 뒤집어 받는다(그대로 두면 조용히 전부 탈락 — 후보 0 에 사유가 없다).
        if (next.min !== undefined && next.max !== undefined && next.min > next.max) [next.min, next.max] = [next.max, next.min];
        onCommit(next.min === undefined && next.max === undefined ? undefined : next);
    };
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <OptNum value={value?.min} normalize={fix} onCommit={(v) => commitSide("min", v)} placeholder="하한" />
            <span style={{ color: "var(--text-tertiary)" }}>~</span>
            <OptNum value={value?.max} normalize={fix} onCommit={(v) => commitSide("max", v)} placeholder="상한" />
            <span style={{ color: "var(--text-tertiary)" }}>{unit}</span>
        </span>
    );
}

/** 비울 수 있는 숫자칸(음수 허용) — NumField 는 하한이 있고 빈칸을 되돌린다. */
function OptNum({ value, onCommit, placeholder, normalize }: {
    value: number | undefined;
    onCommit: (v: number | undefined) => void;
    placeholder: string;
    normalize?: (v: number) => number;
}): JSX.Element {
    const [draft, setDraft] = useState(value === undefined ? "" : String(value));
    useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
    const commit = (): void => {
        if (draft.trim() === "") { if (value !== undefined) onCommit(undefined); return; }
        const raw = Number(draft);
        if (!Number.isFinite(raw)) { setDraft(value === undefined ? "" : String(value)); return; }
        const v = normalize ? normalize(raw) : raw;
        setDraft(String(v)); // 정규화가 저장값을 안 바꿔도(useEffect 미발화) 칸은 실값을 보인다
        if (v !== value) onCommit(v);
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

function AddMenu({ options, onPick }: { options: readonly ChainCheck[]; onPick: (c: ChainCheck) => void }): JSX.Element | null {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        window.addEventListener("mousedown", close);
        return () => window.removeEventListener("mousedown", close);
    }, [open]);
    if (options.length === 0) return null;
    return (
        <span ref={ref} style={{ position: "relative" }}>
            <button onClick={() => setOpen((o) => !o)} title="봉 조건 더하기 — 순번은 조건을 다 통과한 봉끼리 센다"
                style={{ fontSize: 10.5, padding: "0 7px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px dashed var(--border-strong)", color: "var(--text-secondary)" }}>
                ＋ 사슬 필터
            </button>
            {open && (
                <div role="menu" style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 2, minWidth: 190,
                    background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", padding: 2,
                }}>
                    {options.map((c) => (
                        <button key={c} role="menuitem" onClick={() => { onPick(c); setOpen(false); }}
                            style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "3px 6px", fontSize: 11, color: "var(--text-primary)" }}>
                            {CHECK_NAME[c]} <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>— {CHECK_HINT[c]}</span>
                        </button>
                    ))}
                </div>
            )}
        </span>
    );
}
