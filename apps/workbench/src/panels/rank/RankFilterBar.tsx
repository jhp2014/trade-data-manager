import { useState, type CSSProperties } from "react";
import { useWorkbench } from "../../store/workbench.js";

// 통합 필터 바 — 배치·시트 공용. 차원(축 밴드·날짜·시간) 칩을 한 줄에서 관리.
//  · 칩끼리 AND, 한 칩 안 구간끼리 OR. 축은 레인/셀 우클릭으로 추가(여기 칩으로 표시), 날짜·시간은 칩 클릭 → 편집.
//  · 전체해제 = 저장 필터 "+ 현재 저장" 과 같은 dashed 버튼(UI 통일).
const AXIS = "#e24b4a";
const DATE = "#0ea5e9";
const TIME = "#8b5cf6";
const korMonth = (m: string): string => { const [y, mo] = m.split("-"); return `${y}년 ${parseInt(mo, 10)}월`; };
const isMonthRange = (r: { from: string; to: string }): string | null => (r.from.endsWith("-01") && r.to.endsWith("-31") && r.from.slice(0, 7) === r.to.slice(0, 7) ? r.from.slice(0, 7) : null);

export function RankFilterBar({ axes, months }: { axes: { id: string; name: string }[]; months: string[] }): JSX.Element {
    const rankBands = useWorkbench((s) => s.rankBands);
    const clearRankBand = useWorkbench((s) => s.clearRankBand);
    const clearRankFilter = useWorkbench((s) => s.clearRankFilter);
    const dateRanges = useWorkbench((s) => s.dateRanges);
    const addDateRange = useWorkbench((s) => s.addDateRange);
    const removeDateRange = useWorkbench((s) => s.removeDateRange);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const addTimeRange = useWorkbench((s) => s.addTimeRange);
    const removeTimeRange = useWorkbench((s) => s.removeTimeRange);
    const [editor, setEditor] = useState<"date" | "time" | null>(null);

    const bandAxes = axes.filter((a) => rankBands[a.id]);
    const has = bandAxes.length > 0 || dateRanges.length > 0 || timeRanges.length > 0;
    const dateSummary = dateRanges.length === 0 ? "" : dateRanges.every(isMonthRange)
        ? (dateRanges.length === 1 ? korMonth(isMonthRange(dateRanges[0])!) : `${korMonth(isMonthRange([...dateRanges].sort((a, b) => a.from < b.from ? -1 : 1)[0])!)} 외 ${dateRanges.length - 1}`)
        : `${dateRanges.length}구간`;
    const timeSummary = timeRanges.map((r) => `${r.from}–${r.to}`).join(" / ");

    return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", flexWrap: "wrap", minHeight: 30 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>필터</span>
            {!has && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>축=레인/셀 우클릭 · 날짜·시간=아래 버튼</span>}
            {bandAxes.map((a) => (
                <button key={a.id} onClick={() => clearRankBand(a.id)} title="이 축 밴드 해제" style={chip(AXIS)}>{a.name} <span style={x}>✕</span></button>
            ))}

            <span style={{ position: "relative" }}>
                {dateRanges.length > 0
                    ? <button onClick={() => setEditor(editor === "date" ? null : "date")} style={chip(DATE)}>날짜 · {dateSummary} <span style={x}>▾</span></button>
                    : <button onClick={() => setEditor(editor === "date" ? null : "date")} style={addBtn}>+ 날짜</button>}
                {editor === "date" && <DateEditor months={months} ranges={dateRanges} onAdd={addDateRange} onRemove={removeDateRange} onClose={() => setEditor(null)} />}
            </span>

            <span style={{ position: "relative" }}>
                {timeRanges.length > 0
                    ? <button onClick={() => setEditor(editor === "time" ? null : "time")} style={chip(TIME)}>시간 · {timeSummary} <span style={x}>▾</span></button>
                    : <button onClick={() => setEditor(editor === "time" ? null : "time")} style={addBtn}>+ 시간</button>}
                {editor === "time" && <TimeEditor ranges={timeRanges} onAdd={addTimeRange} onRemove={removeTimeRange} onClose={() => setEditor(null)} />}
            </span>

            {has && <button onClick={clearRankFilter} title="필터 전체 해제" style={{ ...dashedBtn, marginLeft: 2 }}>전체해제</button>}
        </div>
    );
}

// 날짜 편집 — 데이터 있는 월 체크(각 월 = 한 구간 OR).
function DateEditor({ months, ranges, onAdd, onRemove, onClose }: { months: string[]; ranges: { from: string; to: string }[]; onAdd: (r: { from: string; to: string }) => void; onRemove: (i: number) => void; onClose: () => void }): JSX.Element {
    const idxOfMonth = (m: string): number => ranges.findIndex((r) => isMonthRange(r) === m);
    return (
        <Pop onClose={onClose} title="날짜 — 데이터 있는 월(여러 개 OR)">
            <div className="no-scrollbar" style={{ maxHeight: 210, overflowY: "auto" }}>
                {months.map((m) => {
                    const i = idxOfMonth(m);
                    const on = i >= 0;
                    return (
                        <button key={m} style={{ ...popRow, fontWeight: on ? 700 : 400, color: on ? "var(--accent-primary)" : "var(--text-primary)" }} onClick={() => (on ? onRemove(i) : onAdd({ from: `${m}-01`, to: `${m}-31` }))}>
                            <span>{korMonth(m)}</span>{on && <span style={{ color: "var(--accent-primary)" }}>✓</span>}
                        </button>
                    );
                })}
            </div>
        </Pop>
    );
}

// 시간 편집 — HH:MM~HH:MM 구간 여러 개(OR).
function TimeEditor({ ranges, onAdd, onRemove, onClose }: { ranges: { from: string; to: string }[]; onAdd: (r: { from: string; to: string }) => void; onRemove: (i: number) => void; onClose: () => void }): JSX.Element {
    return (
        <Pop onClose={onClose} title="시간 — 구간끼리 OR">
            {ranges.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", fontSize: 12.5 }}>
                    <span className="tabular">{r.from}</span><span style={{ color: "var(--text-tertiary)" }}>~</span><span className="tabular">{r.to}</span>
                    <button onClick={() => onRemove(i)} title="구간 삭제" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
            ))}
            <AddTimeRow onAdd={onAdd} />
        </Pop>
    );
}
function AddTimeRow({ onAdd }: { onAdd: (r: { from: string; to: string }) => void }): JSX.Element {
    const [from, setFrom] = useState("09:00");
    const [to, setTo] = useState("09:30");
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px 4px", borderTop: "1px solid var(--border-subtle)", marginTop: 4 }}>
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} style={timeInput} />
            <span style={{ color: "var(--text-tertiary)" }}>~</span>
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)} style={timeInput} />
            <button onClick={() => { if (from && to) onAdd({ from, to: from <= to ? to : from }); }} style={{ ...dashedBtn, marginLeft: "auto" }}>+ 구간</button>
        </div>
    );
}

function Pop({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
    return (<>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 41, minWidth: 180, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", overflow: "hidden" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", padding: "8px 12px 4px" }}>{title}</div>
            {children}
        </div>
    </>);
}

function chip(color: string): CSSProperties {
    return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11.5, cursor: "pointer", border: `1px solid ${color}`, background: color + "22", color };
}
const x: CSSProperties = { fontSize: 11, opacity: 0.8 };
const addBtn: CSSProperties = { fontSize: 11, padding: "2px 9px", borderRadius: 12, border: "1px dashed var(--border-strong)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" };
const dashedBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" };
const popRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, padding: "6px 12px", whiteSpace: "nowrap" };
const timeInput: CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)", padding: "2px 4px", fontSize: 11.5, outline: "none" };
