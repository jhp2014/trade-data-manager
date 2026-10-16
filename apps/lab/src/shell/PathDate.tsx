// 경로 줄 날짜 — 날짜(요일) 버튼. 누르면 년 | 월 | 그 달 달력 판이 열리고, 거래일(분봉 있는 날)만 고를 수 있다.
// 앞뒤 거래일 버튼(‹ ›)은 실수로 눌리기 쉬워 뺐다. 직접 입력은 없다. 거래일 목록이 없으면(받는 중·tdm api 꺼짐) 판은 "거래일 목록 없음"만 보인다.
// workbench components/DatePicker.tsx 의 년>월>일 캐스케이드를 따르되, 일은 세로 목록 대신 그 달 달력이다.
import { useMemo, useState } from "react";
import { useTradingDays } from "../market/queries.js";
import { dateLabel } from "../lib/date.js";
import { initialView, monthForYear, monthsByYear } from "../lib/tradingDays.js";
import { TriggerPopover } from "../ui/popover/TriggerPopover.js";

const NO_DAYS: readonly string[] = [];

export function PathDate({ date, onPick }: { date: string; onPick: (date: string) => void }): JSX.Element {
    const days = useTradingDays().data ?? NO_DAYS;
    return (
        <TriggerPopover
            align="start"
            trigger={(open, toggle) => (
                <button
                    className="tabular"
                    title="날짜 고르기 (거래일)"
                    onClick={toggle}
                    style={{
                        border: "none", borderRadius: 4, padding: "1px 6px", fontSize: 12, cursor: "pointer", font: "inherit",
                        background: open ? "var(--accent-soft)" : "var(--bg-secondary)",
                        color: date ? "var(--text-primary)" : "var(--text-3)",
                    }}
                >
                    {date ? dateLabel(date) : "날짜"} <span style={{ fontSize: 9, color: "var(--text-3)" }}>▾</span>
                </button>
            )}
        >
            {(close) => (
                // 목록이 도착하면 처음 보일 년·월을 다시 잡는다(열어 둔 채 받아도).
                <DateBoard
                    key={days.length > 0 ? "ready" : "empty"}
                    days={days}
                    value={date}
                    onPick={(d) => {
                        onPick(d);
                        close();
                    }}
                />
            )}
        </TriggerPopover>
    );
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const head: React.CSSProperties = { fontSize: 10.5, color: "var(--text-3)", marginBottom: 4 };

/** 년 목록 | 월 4×3 | 그 달 달력. 거래일 없는 월·날은 흐리게(누를 수 없음). */
function DateBoard({ days, value, onPick }: { days: readonly string[]; value: string; onPick: (date: string) => void }): JSX.Element {
    const byYear = useMemo(() => monthsByYear(days), [days]);
    const daySet = useMemo(() => new Set(days), [days]);
    const start = initialView(days, value);
    const [year, setYear] = useState(start?.year ?? "");
    const [month, setMonth] = useState(start?.month ?? "");
    if (days.length === 0 || !start) return <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-3)" }}>거래일 목록 없음</div>;

    const years = [...byYear.keys()].sort().reverse();
    const months = byYear.get(year);
    const first = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).getUTCDay();
    const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return (
        <div style={{ display: "flex", gap: 14, padding: "10px 12px" }}>
            <div>
                <div style={head}>년</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {years.map((y) => (
                        <Cell key={y} on={y === year} onClick={() => {
                            setYear(y);
                            setMonth(monthForYear(byYear.get(y), month));
                        }}>
                            {y}
                        </Cell>
                    ))}
                </div>
            </div>
            <div>
                <div style={head}>월</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 34px)", gap: 2 }}>
                    {MONTHS.map((m) => (
                        <Cell key={m} title={`${Number(m)}월`} on={m === month} disabled={!months?.has(m)} onClick={() => setMonth(m)} center>
                            {Number(m)}
                        </Cell>
                    ))}
                </div>
            </div>
            <div>
                <div style={head}>
                    {year}년 {Number(month)}월
                </div>
                <div role="grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 26px)", gap: 2 }}>
                    {WEEK.map((w) => (
                        <span key={w} style={{ fontSize: 10.5, textAlign: "center", color: "var(--text-3)" }}>
                            {w}
                        </span>
                    ))}
                    {Array.from({ length: first }, (_, i) => (
                        <span key={`b${i}`} />
                    ))}
                    {Array.from({ length: last }, (_, i) => {
                        const iso = `${year}-${month}-${String(i + 1).padStart(2, "0")}`;
                        return (
                            <Cell key={iso} title={iso} on={iso === value} disabled={!daySet.has(iso)} onClick={() => onPick(iso)} center>
                                {i + 1}
                            </Cell>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** 판의 한 칸 — 마우스 올림·고른 칸 바탕은 .menu-item(styles.css)이 칠한다. */
function Cell({ on, disabled = false, center = false, title, onClick, children }: {
    on: boolean;
    disabled?: boolean;
    center?: boolean;
    title?: string;
    onClick: () => void;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <button
            className="menu-item tabular"
            title={title}
            disabled={disabled}
            onClick={onClick}
            {...(on ? { "data-selected": "" } : {})}
            style={{
                border: "none", borderRadius: 5, padding: center ? "3px 0" : "3px 8px", fontSize: 12, textAlign: center ? "center" : "left",
                cursor: disabled ? "default" : "pointer", fontWeight: on ? 700 : 400,
                color: on ? "var(--accent-hover)" : disabled ? "var(--text-3)" : "var(--text-primary)", opacity: disabled ? 0.45 : 1,
            }}
        >
            {children}
        </button>
    );
}
