import { type CSSProperties } from "react";
import { useWorkbench } from "../../store/workbench.js";

// 통합 필터 바 — 배치·시트 공용. 차원(축 밴드·날짜·시간) 칩을 한 줄에서 관리.
//  · 칩끼리 AND, 한 칩 안 구간끼리 OR. 축·날짜·시간 입력은 배치 보드에서(축=레인/셀 우클릭, 날짜/시간=레일 드래그).
//    여긴 표시 + 삭제(칩 ×) + 기본 구간 추가(+ 날짜/시간, 세부는 레일에서 조정). 우측 정렬(저장 필터 "+현재 저장"과 통일).
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
    const setDateRanges = useWorkbench((s) => s.setDateRanges);
    const timeRanges = useWorkbench((s) => s.timeRanges);
    const setTimeRanges = useWorkbench((s) => s.setTimeRanges);

    const bandAxes = axes.filter((a) => rankBands[a.id]);
    const has = bandAxes.length > 0 || dateRanges.length > 0 || timeRanges.length > 0;
    const dateSummary = dateRanges.length === 0 ? "" : dateRanges.every(isMonthRange)
        ? (dateRanges.length === 1 ? korMonth(isMonthRange(dateRanges[0])!) : `${korMonth(isMonthRange([...dateRanges].sort((a, b) => a.from < b.from ? -1 : 1)[0])!)} 외 ${dateRanges.length - 1}`)
        : dateRanges.map((r) => `${r.from.slice(2)}~${r.to.slice(2)}`).join(" / ");
    const timeSummary = timeRanges.map((r) => `${r.from}–${r.to}`).join(" / ");
    const addDate = (): void => setDateRanges([...dateRanges, months[0] ? { from: `${months[0]}-01`, to: `${months[0]}-31` } : { from: "", to: "" }]);
    const addTime = (): void => setTimeRanges([...timeRanges, { from: "09:00", to: "15:30" }]);

    return (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", flexWrap: "wrap", minHeight: 30 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>필터</span>
            {!has && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>축=레인/셀 우클릭 · 날짜·시간=레일 드래그(또는 아래 버튼)</span>}
            {bandAxes.map((a) => (
                <button key={a.id} onClick={() => clearRankBand(a.id)} title="이 축 밴드 해제" style={chip(AXIS)}>{a.name} <span style={x}>✕</span></button>
            ))}
            {dateRanges.length > 0 && <button onClick={() => setDateRanges([])} title="날짜 필터 해제(세부는 레일에서)" style={chip(DATE)}>날짜 · {dateSummary} <span style={x}>✕</span></button>}
            {timeRanges.length > 0 && <button onClick={() => setTimeRanges([])} title="시간 필터 해제(세부는 레일에서)" style={chip(TIME)}>시간 · {timeSummary} <span style={x}>✕</span></button>}

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button onClick={addDate} title="날짜 구간 추가(레일에서 조정)" style={dashedBtn}>+ 날짜</button>
                <button onClick={addTime} title="시간 구간 추가(레일에서 조정)" style={dashedBtn}>+ 시간</button>
                {has && <button onClick={clearRankFilter} title="필터 전체 해제" style={dashedBtn}>전체해제</button>}
            </div>
        </div>
    );
}

function chip(color: string): CSSProperties {
    return { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11.5, cursor: "pointer", border: `1px solid ${color}`, background: color + "22", color };
}
const x: CSSProperties = { fontSize: 11, opacity: 0.8 };
const dashedBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" };
