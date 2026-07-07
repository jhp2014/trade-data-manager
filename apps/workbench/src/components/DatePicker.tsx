import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataDatesQuery } from "../api/queries.js";
import { Popover } from "./Popover.js";

// data-aware 날짜피커 — 전체 달력이 아니라 실제 데이터 있는 년>월>일만 캐스케이드로 보여준다(요일 함께).
const WD = ["일", "월", "화", "수", "목", "금", "토"];
function weekday(y: string, m: string, d: string): string {
    return WD[new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
}

// year -> month("01".."12") -> days("01".."31", 오름차순)
function buildTree(dates: string[]): Map<string, Map<string, string[]>> {
    const tree = new Map<string, Map<string, string[]>>();
    for (const dt of dates) {
        const [y, m, d] = dt.split("-");
        let months = tree.get(y);
        if (!months) {
            months = new Map();
            tree.set(y, months);
        }
        const days = months.get(m);
        if (days) days.push(d);
        else months.set(m, [d]);
    }
    return tree;
}

const colStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto", minWidth: 64 };
const headStyle: React.CSSProperties = { fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.4, padding: "0 6px 4px" };
function itemStyle(active: boolean): React.CSSProperties {
    return {
        textAlign: "left",
        whiteSpace: "nowrap",
        padding: "3px 10px",
        borderRadius: 5,
        background: active ? "var(--accent-soft)" : "none",
        color: active ? "var(--accent-hover)" : "var(--text-primary)",
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
        font: "inherit",
    };
}

function DateGrid({ tree, value, onPick }: { tree: Map<string, Map<string, string[]>>; value: string; onPick: (date: string) => void }): JSX.Element {
    const years = useMemo(() => [...tree.keys()].sort().reverse(), [tree]);
    const monthsOf = (y: string): string[] => [...(tree.get(y)?.keys() ?? [])].sort().reverse();

    const initYear = value && tree.has(value.slice(0, 4)) ? value.slice(0, 4) : years[0];
    const [selYear, setSelYear] = useState<string>(initYear ?? "");
    const vm = value.slice(5, 7);
    const [selMonth, setSelMonth] = useState<string>(monthsOf(initYear ?? "").includes(vm) ? vm : (monthsOf(initYear ?? "")[0] ?? ""));

    const months = monthsOf(selYear);
    const days = tree.get(selYear)?.get(selMonth) ?? [];

    const pickYear = (y: string): void => {
        setSelYear(y);
        setSelMonth(monthsOf(y)[0] ?? "");
    };

    if (years.length === 0) return <div style={{ padding: 8, color: "var(--text-tertiary)", fontSize: 12 }}>데이터 있는 날짜 없음</div>;

    return (
        <div style={{ display: "flex", gap: 8 }}>
            <div style={colStyle}>
                <div style={headStyle}>년</div>
                {years.map((y) => (
                    <button key={y} onClick={() => pickYear(y)} style={itemStyle(y === selYear)}>{y}</button>
                ))}
            </div>
            <div style={colStyle}>
                <div style={headStyle}>월</div>
                {months.map((m) => (
                    <button key={m} onClick={() => setSelMonth(m)} style={itemStyle(m === selMonth)}>{Number(m)}월</button>
                ))}
            </div>
            <div style={colStyle}>
                <div style={headStyle}>일</div>
                {days.map((d) => {
                    const iso = `${selYear}-${selMonth}-${d}`;
                    return (
                        <button key={d} onClick={() => onPick(iso)} style={itemStyle(iso === value)}>
                            {Number(d)}일 <span style={{ color: "var(--text-tertiary)" }}>({weekday(selYear, selMonth, d)})</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function DatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }): JSX.Element {
    const { data: dates } = useQuery(dataDatesQuery());
    const tree = useMemo(() => buildTree(dates ?? []), [dates]);
    const label = value ? `${value} (${weekday(value.slice(0, 4), value.slice(5, 7), value.slice(8, 10))})` : "날짜";
    return (
        <Popover
            trigger={(open, toggle) => (
                <button
                    onClick={toggle}
                    title="날짜 선택 (데이터 있는 날)"
                    style={{
                        background: open ? "var(--bg-tertiary)" : "none",
                        border: "none",
                        borderRadius: 5,
                        padding: "2px 6px",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        font: "inherit",
                    }}
                >
                    {label}
                </button>
            )}
        >
            {(close) => <DateGrid tree={tree} value={value} onPick={(d) => { onChange(d); close(); }} />}
        </Popover>
    );
}
