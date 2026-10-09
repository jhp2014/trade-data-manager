// 날짜 고르기 판 — **연 칩 · 월 칩 · 월~금 달력**(2026-10-09, 옛 dailyExplore/DateJumpMenu 승계).
// 헤더 `stepper` 의 판 속으로 쓴다 — 첫 소비자 = 일별 [탐색](거래일) · 라벨 [탐색](월). 규칙: decisions 「stepper」.
//
// 연·월은 칩 줄로 따로(2026-09-30 사용자 확정 — 수백 줄 스크롤보다 탭처럼 연 따로 월 따로가 빠르다),
// 일은 **월~금 5열 달력**: 요일에 맞춰 서서 주 구조가 보이고, 휴장이 그 자리에 보인다.
//  · 휴장 = 거래일 목록(분봉 보유일)의 **데이터 구간 안**에서 빠진 평일 — 취소선. 미수집과는 구별 못 한다.
//  · 구간 밖(수집 전·아직 안 온 날) = **빈 칸** — 흐린 글자로 두면 「0건」과 같은 얼굴이 된다(리뷰).
//  · 칸 표식(D1) = 소비자가 주는 `markOf` — has(점) · zero(흐린 글자) · unknown(표식 없음). 부품은 뜻을 모른다.
// 판 안에 ◀▶ 는 없다 — 입구(stepper)가 늘 화살표와 함께 선다.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { weekdayOf } from "../lib/date.js";
import { MENU_PAD, MenuSep } from "./popover/menu.js";

export type DayMark = "has" | "zero" | "unknown";

/** 날짜 목록(오름차순) → 연 → 월 → 날짜들. 순수 색인이라 테스트 표면이다. */
export function indexDates(dates: readonly string[]): Map<string, Map<string, string[]>> {
    const out = new Map<string, Map<string, string[]>>();
    for (const d of dates) {
        const y = d.slice(0, 4);
        const m = d.slice(5, 7);
        const months = out.get(y) ?? new Map<string, string[]>();
        if (!out.has(y)) out.set(y, months);
        const days = months.get(m) ?? [];
        if (!months.has(m)) months.set(m, days);
        days.push(d);
    }
    return out;
}

/** 고른 값이 목록에 없을 때 — 숫자로 가장 가까운 것으로(연을 바꿔도 보던 달 근처에 머물게). */
export function nearestOf(options: readonly string[], want: string): string {
    if (options.length === 0) return want;
    let best = options[0]!;
    for (const o of options) if (Math.abs(Number(o) - Number(want)) < Math.abs(Number(best) - Number(want))) best = o;
    return best;
}

/**
 * 한 달의 월~금 격자 — 줄 = 주, 칸 = 월(0)~금(4), 비면 null. 주말은 건너뛰고, 1일이 주말이면 첫 줄은
 * 다음 월요일부터다(빈 줄을 안 만든다).
 */
export function monthGridOf(ym: string): (string | null)[][] {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const last = new Date(y, m, 0).getDate();
    const rows: (string | null)[][] = [];
    let row: (string | null)[] | null = null;
    let lastCol = 5;
    for (let d = 1; d <= last; d++) {
        const dow = new Date(y, m - 1, d).getDay();
        if (dow === 0 || dow === 6) continue;
        const col = dow - 1;
        if (row === null || col <= lastCol) {
            row = [null, null, null, null, null];
            rows.push(row);
        }
        row[col] = `${ym}-${String(d).padStart(2, "0")}`;
        lastCol = col;
    }
    return rows;
}

/** 칸의 바탕 성질 — 거래일 · 휴장(데이터 구간 안의 빠진 평일) · 구간 밖(수집 전·미래). */
export function dayKindOf(date: string, trading: ReadonlySet<string>, first: string | undefined, last: string | undefined): "trading" | "holiday" | "outside" {
    if (trading.has(date)) return "trading";
    return first !== undefined && last !== undefined && date > first && date < last ? "holiday" : "outside";
}

export function DateCalendar({ tradingDates, current, viewMonth, months, markOf, canPick, onPick, onMonth, lead, markHelp }: {
    /** 거래일(분봉 보유일) 오름차순 — 휴장 판정의 재료. 연·월 칩도 `months` 가 없으면 여기서 선다. */
    tradingDates: readonly string[];
    /** 지금 보는 날 — 그 칸을 채운다. null = 강조 없음. */
    current: string | null;
    /** 펼 달(YYYY-MM) — 생략 = current 의 달. 바뀌면 고른 연·월을 버리고 다시 따른다. */
    viewMonth?: string;
    /** 연·월 칩에 설 달(YYYY-MM, 오름차순) — 생략 = 거래일이 있는 달 전부. */
    months?: readonly string[];
    /** 칸 표식 — 거래일 칸에만 묻는다. 생략 = 전부 unknown. */
    markOf?: (date: string) => DayMark;
    /** 이 거래일을 누를 수 있나 — 생략 = 거래일이면 전부. */
    canPick?: (date: string) => boolean;
    onPick: (date: string) => void;
    /** 연·월 칩을 고른 것 자체가 뜻이 있는 소비자(라벨 판 = 그 달로 목록 전환). 없으면 달력만 바뀐다. */
    onMonth?: (ym: string) => void;
    /** 칩 줄 맨 앞의 소비자 고유 칸(라벨 판 「전체」). */
    lead?: ReactNode;
    /** 표식 hover 의 뜻 — 소비자가 말한다(has/zero 각각). */
    markHelp?: { has: string; zero: string };
}): JSX.Element {
    const trading = useMemo(() => new Set(tradingDates), [tradingDates]);
    const first = tradingDates[0];
    const last = tradingDates[tradingDates.length - 1];
    const byYm = useMemo(
        () => indexDates((months ?? tradingDates.map((d) => d.slice(0, 7))).map((ym) => `${ym}-01`).filter((d, i, a) => i === 0 || a[i - 1] !== d)),
        [months, tradingDates],
    );
    const follow = viewMonth ?? (current ?? last ?? "").slice(0, 7);
    // 고른 연·월 — null = 따른다. 따를 값이 바뀌면 버린다(판을 든 채 넘겼는데 달력이 옛 달에 머물면 "어디를 보나"가 갈린다).
    const [sel, setSel] = useState<{ y: string; m: string } | null>(null);
    useEffect(() => setSel(null), [follow]);

    const years = useMemo(() => [...byYm.keys()], [byYm]);
    const wantY = sel?.y ?? follow.slice(0, 4);
    const y = byYm.has(wantY) ? wantY : nearestOf(years, wantY);
    const ms = useMemo(() => [...(byYm.get(y)?.keys() ?? [])], [byYm, y]);
    const wantM = sel?.m ?? follow.slice(5, 7);
    const m = ms.includes(wantM) ? wantM : nearestOf(ms, wantM);
    const ym = `${y}-${m}`;
    const grid = useMemo(() => (years.length > 0 ? monthGridOf(ym) : []), [years.length, ym]);

    const pickMonth = (ny: string, nm: string): void => {
        const nms = [...(byYm.get(ny)?.keys() ?? [])];
        const fm = nms.includes(nm) ? nm : nearestOf(nms, nm);
        setSel({ y: ny, m: fm });
        onMonth?.(`${ny}-${fm}`);
    };

    return (
        <div style={{ padding: MENU_PAD }}>
            {years.length === 0 && <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>날짜 목록이 아직 없습니다</div>}
            <div className="tabular" style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "4px 8px 0" }}>
                {lead}
                {years.map((o) => (
                    <button key={o} onClick={() => pickMonth(o, m)} title={`${o}년`} style={pickChip(o === y)}>{o}</button>
                ))}
            </div>
            <div className="tabular" style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "5px 8px 0" }}>
                {ms.map((o) => (
                    <button key={o} onClick={() => pickMonth(y, o)} title={`${y}년 ${Number(o)}월`} style={pickChip(o === m)}>{Number(o)}월</button>
                ))}
            </div>
            <div style={{ height: 6 }} />
            <MenuSep />
            {grid.length > 0 && (
                <div className="tabular" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2, padding: "6px 8px 2px", textAlign: "center" }}>
                    {WEEKDAYS.map((w) => <div key={w} style={{ fontSize: 10, color: "var(--text-tertiary)", paddingBottom: 2 }}>{w}</div>)}
                    {grid.flat().map((d, i) => {
                        if (d === null) return <div key={`e${i}`} />;
                        const kind = dayKindOf(d, trading, first, last);
                        if (kind === "outside") return <div key={d} />;
                        const mark = kind === "trading" ? (markOf?.(d) ?? "unknown") : null;
                        const pickable = kind === "trading" && (canPick?.(d) ?? true);
                        const cur = d === current;
                        const day = Number(d.slice(8, 10));
                        const why = kind === "holiday" ? "휴장(거래일 목록에 없음)"
                            : cur ? "지금 보는 날" : mark === "has" ? (markHelp?.has ?? "") : mark === "zero" ? (markHelp?.zero ?? "") : "아직 모름";
                        return (
                            <button key={d} className="cal-day" onClick={pickable ? () => onPick(d) : undefined} disabled={!pickable}
                                title={`${d} (${weekdayOf(d)})${why ? ` — ${why}` : ""}`}
                                style={dayCell(cur, kind, mark, pickable)}>
                                <span style={{ lineHeight: "14px" }}>{day}</span>
                                <span aria-hidden style={{ height: 5, lineHeight: "5px", fontSize: 7, color: cur ? "#fff" : "var(--accent-primary)" }}>
                                    {mark === "has" ? "●" : ""}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const WEEKDAYS = ["월", "화", "수", "목", "금"] as const;

/** 연·월 고르기 칩 — 고른 것 = 옅은 액센트 면(세그먼트의 켜진 칸과 같은 결). 소비자의 lead 칸도 이 모양을 쓴다. */
export const pickChip = (on: boolean): CSSProperties => ({
    fontSize: 10.5, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer", whiteSpace: "nowrap",
    background: on ? "var(--accent-soft)" : "none",
    color: on ? "var(--accent-hover)" : "var(--text-tertiary)", fontWeight: on ? 600 : 400,
});

/** 일 칸 — 지금 보는 날 = 채움 · 0건 = 흐린 글자 · 휴장 = 흐린 취소선(구간 밖은 칸을 안 그린다). 점 자리는 늘 비워 둔다(높이 고정). */
function dayCell(cur: boolean, kind: "trading" | "holiday", mark: DayMark | null, pickable: boolean): CSSProperties {
    const dim = kind !== "trading" || mark === "zero";
    return {
        display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 0 1px", fontSize: 11, borderRadius: 4,
        border: "none", cursor: pickable ? "pointer" : "default",
        // 채움은 지금 보는 날만 인라인 — 나머지 칸의 hover 면은 CSS(`.cal-day`)가 칠한다(인라인 배경은 :hover 를 이긴다).
        ...(cur ? { background: "var(--accent-primary)" } : null),
        color: cur ? "#fff" : dim ? "var(--border-strong)" : "var(--text-secondary)",
        fontWeight: cur ? 600 : 400,
        textDecoration: kind === "holiday" ? "line-through" : "none",
    };
}
