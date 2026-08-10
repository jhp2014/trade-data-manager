// 미배치 트레이 — **날짜로 찾아간다**.
//
// 후보가 수천 건(실측 4806)이라 평면 목록으로는 원하는 걸 못 찾는다. 자연스러운 계층은 날짜 → 종목이다
// (하루에 여러 종목을 그었으므로). 그래서 월로 좁히고 날짜로 묶는다. 검색은 그 위에 얹는 보조 수단.
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { stocksMetaQuery } from "../../api/queries.js";
import type { CandidateDay, MapItemRef } from "../../api/map.js";
import { MonthPicker } from "../WorksetRows.js";
import { dayKey, groupByDate, monthsOf } from "./mapView.js";

const ALL = "전체";

export function MapTray({
    unplaced,
    onPickDown,
    onPickMove,
    onPickUp,
}: {
    unplaced: CandidateDay[];
    onPickDown: (e: ReactPointerEvent<HTMLDivElement>, item: MapItemRef, name: string) => void;
    onPickMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPickUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}): JSX.Element {
    const [month, setMonth] = useState<string | null>(null); // null = 아직 안 고름 → 최신 월
    const [query, setQuery] = useState("");

    const months = useMemo(() => monthsOf(unplaced), [unplaced]);
    // ⚠ 기본값을 "전체"로 두면 안 된다: 미배치가 수천이라 줄을 전부 DOM 에 올리고, 이름 조회도 수천 코드가
    // 한 URL 에 실려 깨진다(실측 4806줄 · 이름이 코드로 나왔다). **최신 월이 기본**이고 전체는 고를 수 있게만.
    const picked = month ?? months[0] ?? ALL;
    // 월로 먼저 좁힌 뒤 그 범위의 이름만 조회한다 — 이름으로 거르려면 이름이 먼저 있어야 하는데,
    // 미배치 전체(수천)의 코드를 넘기면 한 번에 수백~수천 종목을 당기게 된다. 월이 그 상한이다.
    const inMonth = useMemo(() => (picked === ALL ? unplaced : unplaced.filter((d) => d.date.startsWith(picked))), [unplaced, picked]);
    const names = useQuery(stocksMetaQuery(inMonth.map((d) => d.stockCode)));
    const nameOf = (code: string): string => names.data?.find((m) => m.stockCode === code)?.name ?? code;

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const hit = q === "" ? inMonth : inMonth.filter((d) => d.stockCode.toLowerCase().includes(q) || nameOf(d.stockCode).toLowerCase().includes(q));
        return groupByDate(hit);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf 는 names.data 파생이라 그걸 의존성으로 든다
    }, [inMonth, query, names.data]);
    const shown = groups.reduce((n, g) => n + g.days.length, 0);

    return (
        <div style={{ width: 176, flex: "none", borderRight: "1px solid var(--border-default)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "5px 6px", borderBottom: "1px solid var(--border-default)" }}>
                <MonthPicker month={picked} months={[ALL, ...months]} onPick={setMonth} />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="종목명·코드"
                    style={{ width: "100%", boxSizing: "border-box", fontSize: 11, marginTop: 4 }}
                />
                <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 3 }}>
                    미배치 {unplaced.length}
                    {shown !== unplaced.length && ` · 보이는 것 ${shown}`}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {groups.length === 0 && (
                    <div style={{ padding: 8, color: "var(--text-tertiary)", fontSize: 11 }}>
                        {unplaced.length === 0 ? "전부 올렸습니다" : "찾은 게 없습니다"}
                    </div>
                )}
                {groups.map((g) => (
                    <div key={g.date}>
                        <div
                            style={{
                                position: "sticky",
                                top: 0,
                                zIndex: 1,
                                background: "var(--bg-primary)",
                                borderBottom: "1px solid var(--border-default)",
                                padding: "3px 7px",
                                fontSize: 11,
                                color: "var(--text-secondary)",
                                display: "flex",
                                justifyContent: "space-between",
                            }}
                        >
                            <span>{g.date}</span>
                            <span style={{ color: "var(--text-tertiary)" }}>{g.days.length}</span>
                        </div>
                        {g.days.map((c) => (
                            <div
                                key={dayKey(c)}
                                onPointerDown={(e) => onPickDown(e, { stockCode: c.stockCode, date: c.date }, nameOf(c.stockCode))}
                                onPointerMove={onPickMove}
                                onPointerUp={onPickUp}
                                style={{ padding: "3px 8px", cursor: "grab", userSelect: "none", fontSize: 11 }}
                                title={`${c.stockCode} · 근거: ${c.traces.join(", ")}`}
                            >
                                {nameOf(c.stockCode)}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
