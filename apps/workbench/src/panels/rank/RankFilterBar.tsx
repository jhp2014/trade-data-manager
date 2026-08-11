import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDismiss } from "../../ui/useDismiss.js";
import { useWorkbench } from "../../store/workbench.js";
import { FILTER } from "../../styles/palette.js";
import type { DateRange, TimeRange } from "../../store/rankFilterSlice.js";
import { isGroupExprEmpty } from "./groupFilter.js";
import { activeValueAxisIds, resolveBound, type AxisValues } from "./axisValueFilter.js";
import { formatAxisValue } from "../../lib/computedAxis.js";
import type { ComputedAxisMeta } from "../../lib/useRankAxes.js";

// 통합 필터 바 — 배치·시트 공용. 차원(축 밴드·날짜·시간) 칩을 한 줄에서 관리.
//  · 칩끼리 AND, 한 칩 안 구간끼리 OR. 축 밴드는 배치 보드에서(레인/셀 우클릭), 날짜/시간은 여기 칩 편집 또는 레일 드래그.
//  · 칩 본문 클릭 = 값 편집(세련된 텍스트 입력, 여러 구간), 칩 ✕ = 그 차원 해제. + 날짜/시간 = 전체 범위 구간 추가.
//  · 그룹 차원은 내부가 DNF 라 칩 하나로 접으면 편집이 안 된다 → 진입 버튼(extra)만 여기 두고 식은 아래 전용 줄에서.
const AXIS = FILTER;
const VALUE = "#14b8a6"; // 계산 축 값 구간 — 판단 축 밴드(빨강)와 한눈에 갈리게
const DATE = "#0ea5e9";
const TIME = "#8b5cf6";

const FIELD_STYLE_ID = "rank-field-style";
if (typeof document !== "undefined" && !document.getElementById(FIELD_STYLE_ID)) {
    const st = document.createElement("style");
    st.id = FIELD_STYLE_ID;
    st.textContent = ".rank-field{background:var(--bg-secondary);border:1px solid transparent;border-radius:8px;padding:6px 9px;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--text-primary);letter-spacing:.02em;outline:none;transition:border-color .1s,box-shadow .1s}.rank-field:focus{border-color:var(--accent-primary);background:var(--bg-primary);box-shadow:0 0 0 3px var(--accent-soft)}.rank-field::placeholder{color:var(--text-tertiary)}";
    document.head.appendChild(st);
}

// yy.mm.dd ↔ YYYY-MM-DD (표시·입력 모두 2자리 연도).
const dTo = (iso: string): string => (iso ? iso.slice(2).replace(/-/g, ".") : "");
const dFrom = (raw: string): string | null => {
    const m = raw.trim().match(/^(\d{2}|\d{4})\.(\d{1,2})\.(\d{1,2})$/);
    if (!m) return null;
    const yy = m[1].length === 4 ? m[1] : `20${m[1]}`;
    const mo = Number(m[2]), da = Number(m[3]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return `${yy}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
};
const tTo = (v: string): string => v;
const tFrom = (raw: string): string | null => {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
};

export function RankFilterBar({ axes, dateBounds, computedValues, computedMeta, extra }: {
    axes: { id: string; name: string }[];
    dateBounds: { min: string; max: string } | null;
    computedValues?: AxisValues;
    /** 계산 축 메타 — 여기선 값 라벨 규격만 쓴다(단위가 축마다 다르다: %·일…). 없으면 등락률 모양. */
    computedMeta?: Map<string, ComputedAxisMeta>;
    extra?: ReactNode;
}): JSX.Element {
    const rankBands = useWorkbench((s) => s.rankBands);
    const clearRankBand = useWorkbench((s) => s.clearRankBand);
    const axisValueRanges = useWorkbench((s) => s.axisValueRanges);
    const setAxisValueRanges = useWorkbench((s) => s.setAxisValueRanges);
    const clearRankFilter = useWorkbench((s) => s.clearRankFilter);
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const setDateRanges = useWorkbench((s) => s.setDateRanges);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const setTimeRanges = useWorkbench((s) => s.setTimeRanges);
    const groupExpr = useWorkbench((s) => s.groupExpr);

    const bandAxes = axes.filter((a) => rankBands[a.id]);
    // 계산 축 값 구간 — 편집은 레일에서 하므로 칩은 "무엇이 걸렸나 + 해제"만 한다(밴드 칩과 같은 역할).
    const valueSet = new Set(computedValues ? activeValueAxisIds(axisValueRanges, computedValues) : []);
    const valueAxes = axes.filter((a) => valueSet.has(a.id));
    const valueLabel = (axisId: string): string => {
        const vals = computedValues?.get(axisId) ?? new Map<string, number>();
        const fmt = computedMeta?.get(axisId)?.fmt ?? formatAxisValue;
        const label = (b: { kind: "point"; point: string } | { kind: "value"; value: number } | undefined, fallback: string): string => {
            if (!b) return fallback;
            const v = resolveBound(b, vals);
            return v === null ? "?" : fmt(v);
        };
        const parts = (axisValueRanges[axisId] ?? []).map((r) => `${label(r.from, "…")}~${label(r.to, "…")}`);
        return summarize(parts);
    };
    // 그룹만 걸려 있어도 "전체해제"가 보여야 한다(clearRankFilter 가 그룹까지 지운다).
    const has = bandAxes.length > 0 || valueAxes.length > 0 || dateRanges.length > 0 || timeRanges.length > 0 || !isGroupExprEmpty(groupExpr);
    const dateLabels = dateRanges.map((r) => `${dTo(r.from)}~${dTo(r.to)}`);
    const timeLabels = timeRanges.map((r) => `${r.from}~${r.to}`);
    const addDate = (): void => { if (dateBounds) setDateRanges([...dateRanges, { from: dateBounds.min, to: dateBounds.max }]); };
    const addTime = (): void => setTimeRanges([...timeRanges, { from: "08:00", to: "20:00" }]);

    return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", flexWrap: "wrap", minHeight: 30 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>필터</span>
            {/* 안내 문구 — 폭 좁으면 컨트롤바 2줄 대신 자연스럽게 잘려 사라지도록(flex 축소 + 말줄임). */}
            {!has && <span style={{ fontSize: 11, color: "var(--text-tertiary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>축=레인/셀 우클릭 · 날짜·시간=칩 클릭 편집(또는 레일 드래그)</span>}
            {bandAxes.map((a) => (
                <button key={a.id} onClick={() => clearRankBand(a.id)} title="이 축 밴드 해제" style={chip(AXIS)}>{a.name} <span style={x}>✕</span></button>
            ))}
            {valueAxes.map((a) => (
                <button key={a.id} onClick={() => setAxisValueRanges(a.id, [])} title="이 축 값 구간 해제(편집은 레일에서)" style={chip(VALUE)}>{a.name} · {valueLabel(a.id)} <span style={x}>✕</span></button>
            ))}
            {dateRanges.length > 0 && (
                <FilterChip color={DATE} label="날짜" summary={summarize(dateLabels)} detail={dateLabels.join(" / ")} onClear={() => setDateRanges([])}>
                    <RangeEditor kind="date" ranges={dateRanges} full={dateBounds ? { from: dateBounds.min, to: dateBounds.max } : null} onChange={setDateRanges} />
                </FilterChip>
            )}
            {timeRanges.length > 0 && (
                <FilterChip color={TIME} label="시간" summary={summarize(timeLabels)} detail={timeLabels.join(" / ")} onClear={() => setTimeRanges([])}>
                    <RangeEditor kind="time" ranges={timeRanges} full={{ from: "08:00", to: "20:00" }} onChange={setTimeRanges} />
                </FilterChip>
            )}

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button onClick={addDate} disabled={!dateBounds} title="날짜 구간 추가(전체 범위 → 칩 클릭으로 조정)" style={dashedBtn}>+ 날짜</button>
                <button onClick={addTime} title="시간 구간 추가(전체 범위 → 칩 클릭으로 조정)" style={dashedBtn}>+ 시간</button>
                {extra}
                {has && <button onClick={clearRankFilter} title="필터 전체 해제" style={dashedBtn}>전체해제</button>}
            </div>
        </div>
    );
}

function summarize(labels: string[]): string {
    if (labels.length === 0) return "";
    return labels.length === 1 ? labels[0] : `${labels[0]} 외 ${labels.length - 1}`;
}

// 칩 — 본문 클릭 = 편집 팝오버 토글, ✕ = 해제. 팝오버는 칩 아래에 앵커(바깥 클릭 시 닫힘).
function FilterChip({ color, label, summary, detail, onClear, children }: { color: string; label: string; summary: string; detail: string; onClear: () => void; children: ReactNode }): JSX.Element {
    const [open, setOpen] = useState(false);
    // 칩(트리거)까지 감싸는 ref — 칩 자체 클릭은 토글이지 '바깥'이 아니다. 그래서 커서 앵커(AnchoredPopover)가
    // 아니라 칩에 붙는 위치(absolute)를 유지하고, 해제 규칙만 공용 훅으로.
    const ref = useRef<HTMLSpanElement | null>(null);
    useDismiss(ref, () => setOpen(false), open); // 콜백은 훅이 ref 로 잡으므로 memo 불필요
    return (
        <span ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 3, padding: "0 3px 0 0", borderRadius: 12, border: `1px solid ${color}`, background: color + "22" }}>
            <button onClick={() => setOpen((o) => !o)} title={`${detail}${detail ? " · " : ""}클릭해 값 편집`} style={{ display: "inline-block", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", padding: "2px 4px 2px 8px", border: "none", background: "transparent", color, cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap", verticalAlign: "middle" }}>{label} · {summary}</button>
            <button onClick={onClear} title="이 필터 해제" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: "50%", border: "none", background: "transparent", color, cursor: "pointer", fontSize: 10, lineHeight: 1 }}>✕</button>
            {open && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 12, boxShadow: "0 12px 34px rgba(0,0,0,0.22)", padding: "11px 13px 12px" }}>
                    {children}
                </div>
            )}
        </span>
    );
}

// 범위 편집 — 구간 여러 개(시작–끝), Enter/포커스 아웃 반영. 잘못된 값은 되돌림. + 구간 = 전체 범위 추가.
function RangeEditor({ kind, ranges, full, onChange }: { kind: "date" | "time"; ranges: (DateRange | TimeRange)[]; full: { from: string; to: string } | null; onChange: (ranges: any[]) => void }): JSX.Element {
    const isDate = kind === "date";
    const disp = isDate ? dTo : tTo;
    const parse = isDate ? dFrom : tFrom;
    const ph = isDate ? { from: "25.07.01", to: "25.07.31" } : { from: "08:00", to: "20:00" };
    const setEdge = (i: number, edge: "from" | "to", raw: string): boolean => {
        const v = parse(raw);
        if (v == null) return false;
        onChange(ranges.map((r, idx) => (idx === i ? { ...r, [edge]: v } : r)));
        return true;
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: isDate ? 210 : 168 }}>
            <div style={{ display: "flex", gap: 8, paddingLeft: 2 }}>
                <span style={{ flex: 1, fontSize: 10, color: "var(--text-tertiary)" }}>시작</span>
                <span style={{ width: 10 }} />
                <span style={{ flex: 1, fontSize: 10, color: "var(--text-tertiary)" }}>끝</span>
                <span style={{ width: 16 }} />
            </div>
            {ranges.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <RangeField value={disp(r.from)} placeholder={ph.from} onCommit={(raw) => setEdge(i, "from", raw)} />
                    <span style={{ width: 10, textAlign: "center", color: "var(--text-tertiary)" }}>–</span>
                    <RangeField value={disp(r.to)} placeholder={ph.to} onCommit={(raw) => setEdge(i, "to", raw)} />
                    <button onClick={() => onChange(ranges.filter((_, idx) => idx !== i))} title="이 구간 삭제" style={{ width: 16, height: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
                </div>
            ))}
            {full && (
                <button onClick={() => onChange([...ranges, { ...full }])} title="전체 범위 구간 추가" style={{ alignSelf: "flex-start", marginTop: 1, border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11, padding: "3px 9px" }}>+ 구간 추가</button>
            )}
        </div>
    );
}

// 세련된 인라인 입력 — Enter/blur 반영, Esc·잘못된 값 되돌림.
function RangeField({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (raw: string) => boolean }): JSX.Element {
    const [text, setText] = useState(value);
    const escRef = useRef(false);
    useEffect(() => { setText(value); }, [value]);
    const commit = (): void => { if (!onCommit(text)) setText(value); };
    return (
        <input className="rank-field" value={text} placeholder={placeholder} style={{ flex: 1, minWidth: 0, width: "100%" }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { e.preventDefault(); escRef.current = true; e.currentTarget.blur(); } }}
            onBlur={() => { if (escRef.current) { escRef.current = false; setText(value); } else commit(); }} />
    );
}

function chip(color: string): CSSProperties {
    return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11.5, cursor: "pointer", border: `1px solid ${color}`, background: color + "22", color };
}
const x: CSSProperties = { fontSize: 11, opacity: 0.8 };
const dashedBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" };
