import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    isFilterActive,
    filterPointsByHypothesis,
    aggregateByAttr,
    applyFacet,
    distinctStockCount,
} from "@trade-data-manager/market/domain";
import { useWorkbench } from "../store/workbench.js";
import { type ReviewPointListItem } from "../api/reviewPoints.js";
import { priceLinedStocksQuery, allPointsQuery, hypothesisLinksQuery } from "../api/queries.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { MonthPicker, LocateIcon, DateHeader, Name, PointRow } from "./WorksetRows.js";

// 작업셋 패널 — 두 모집단 소스를 한 리스트 UI 로.
//  · 기본(월별): 선 있는 (종목,날짜) ∪ 타점을 월별로 브라우징(연대순 진입).
//  · 가설 필터 활성 시: 필터에 걸린 타점을 전 기간 flat 으로 + outcome 집계 + outcome 패싯(의미 진입).
// 필터 활성여부(비어있지 않은 그룹 ≥1)가 곧 모드 — 별도 플래그 없음. 타점 클릭 → date·code·time focus.

function monthOf(date: string): string {
    return date.slice(0, 7);
}

interface StockEntry {
    date: string;
    code: string;
    name: string | null;
    points: ReviewPointListItem[];
}

// (종목,날짜) 단위로 타점 병합 → 날짜 내림차순, 같은 날 종목코드 오름차순 → 날짜로 그룹.
function groupByDate(entries: StockEntry[]): { date: string; stocks: StockEntry[] }[] {
    entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.code < b.code ? -1 : 1));
    const out: { date: string; stocks: StockEntry[] }[] = [];
    for (const e of entries) {
        let g = out[out.length - 1];
        if (!g || g.date !== e.date) {
            g = { date: e.date, stocks: [] };
            out.push(g);
        }
        g.stocks.push(e);
    }
    return out;
}

export function WorksetPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const setFocus = useWorkbench((s) => s.setFocus);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const filterDraft = useWorkbench((s) => s.filterDraft);
    const outcomeSel = useWorkbench((s) => s.facetSelected.outcome);
    const toggleFacet = useWorkbench((s) => s.toggleFacet);

    const stocksQ = useQuery(priceLinedStocksQuery());
    const pointsQ = useQuery(allPointsQuery());
    const linksQ = useQuery(hypothesisLinksQuery());
    const stocks = useMemo(() => stocksQ.data ?? [], [stocksQ.data]);
    const points = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);
    const links = useMemo(() => linksQ.data ?? [], [linksQ.data]);

    const filterOn = isFilterActive(filterDraft);

    // ── 필터 모드 계산 — P1(가설필터) 기준 집계, outcome 패싯으로 P2 좁힘.
    const p1 = useMemo(() => (filterOn ? filterPointsByHypothesis(points, links, filterDraft) : []), [filterOn, points, links, filterDraft]);
    const buckets = useMemo(() => aggregateByAttr(p1, "outcome"), [p1]);
    const p2 = useMemo(() => applyFacet(p1, "outcome", new Set(outcomeSel)), [p1, outcomeSel]);
    const filterGroups = useMemo(() => {
        const map = new Map<string, StockEntry>();
        for (const p of p2) {
            const k = `${p.date}|${p.stockCode}`;
            let e = map.get(k);
            if (!e) {
                e = { date: p.date, code: p.stockCode, name: p.name, points: [] };
                map.set(k, e);
            }
            e.points.push(p);
        }
        for (const e of map.values()) e.points.sort((a, b) => (a.time < b.time ? -1 : 1));
        return groupByDate([...map.values()]);
    }, [p2]);

    // ── 월별 모드 계산.
    const months = useMemo(() => {
        const set = new Set<string>();
        for (const s of stocks) set.add(monthOf(s.date));
        for (const p of points) set.add(monthOf(p.date));
        return [...set].sort().reverse();
    }, [stocks, points]);
    const [selMonth, setSelMonth] = useState<string | null>(null);
    const month = useMemo(() => {
        if (selMonth && months.includes(selMonth)) return selMonth;
        const fm = monthOf(focusDate);
        return months.includes(fm) ? fm : (months[0] ?? fm);
    }, [selMonth, months, focusDate]);
    const monthGroups = useMemo(() => {
        const map = new Map<string, StockEntry>();
        const ensure = (date: string, code: string, name: string | null): StockEntry => {
            const k = `${date}|${code}`;
            let e = map.get(k);
            if (!e) {
                e = { date, code, name, points: [] };
                map.set(k, e);
            }
            if (!e.name && name) e.name = name;
            return e;
        };
        for (const s of stocks) if (monthOf(s.date) === month) ensure(s.date, s.stockCode, s.name);
        for (const p of points) if (monthOf(p.date) === month) ensure(p.date, p.stockCode, p.name).points.push(p);
        for (const e of map.values()) e.points.sort((a, b) => (a.time < b.time ? -1 : 1));
        return groupByDate([...map.values()]);
    }, [stocks, points, month]);

    const groups = filterOn ? filterGroups : monthGroups;

    // 핀 이름 — 현재 종목명(두 데이터셋 중 아무 곳). 핀은 이름만(클릭=스크롤 점프).
    const pinnedName = useMemo(() => {
        if (!focusCode) return null;
        return stocks.find((s) => s.stockCode === focusCode)?.name ?? points.find((p) => p.stockCode === focusCode)?.name ?? null;
    }, [focusCode, stocks, points]);

    const anchorRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const scrollToCurrent = (): void => {
        if (!focusCode) return;
        const exact = anchorRefs.current.get(`${focusDate}|${focusCode}`);
        const target = exact ?? [...anchorRefs.current.entries()].find(([k]) => k.endsWith(`|${focusCode}`))?.[1];
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    if (stocksQ.isLoading || pointsQ.isLoading) return <BoardCenter text="작업셋 로딩중…" />;
    if (stocksQ.isError) return <BoardCenter text={`작업셋 오류: ${(stocksQ.error as Error).message}`} />;
    if (pointsQ.isError) return <BoardCenter text={`타점 오류: ${(pointsQ.error as Error).message}`} />;

    const emptyText = filterOn ? "필터에 걸린 타점 없음" : "이 달 항목 없음";

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            {/* 헤더 — 월별: 월 선택 / 필터: 결과 요약 + outcome 패싯. 공통: 조준 아이콘. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                    {filterOn ? (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-primary)" }}>가설 필터</span>
                            <span className="tabular" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                {distinctStockCount(p1)}종목 · {p1.length}타점
                                {outcomeSel.length > 0 && <span style={{ color: "var(--text-tertiary)" }}> · {p2.length} 표시</span>}
                            </span>
                        </div>
                    ) : (
                        <MonthPicker month={month} months={months} onPick={setSelMonth} />
                    )}
                    {focusCode && (
                        <button
                            onClick={pinnedName ? scrollToCurrent : undefined}
                            disabled={!pinnedName}
                            title={pinnedName ? "현재 종목 위치로 스크롤" : "선택한 종목은 목록에 없습니다"}
                            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", padding: "2px 3px", border: "none", background: "none", cursor: pinnedName ? "pointer" : "default", lineHeight: 0, opacity: pinnedName ? 1 : 0.35 }}
                        >
                            <LocateIcon />
                        </button>
                    )}
                </div>

                {/* outcome 집계 = 패싯 토글 겸함(필터 모드만). 클릭하면 그 outcome 만 리스트에 표시. */}
                {filterOn && buckets.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {buckets.map((b) => {
                            const sel = outcomeSel.some((v) => v === b.value);
                            const label = b.value ?? "미분류";
                            return (
                                <button
                                    key={label}
                                    onClick={() => toggleFacet("outcome", b.value)}
                                    title={`${label}: ${b.pointCount}타점 · ${b.stockCount}종목`}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 5,
                                        border: `1px solid ${sel ? "var(--accent-primary)" : "var(--border-default)"}`,
                                        borderRadius: 20,
                                        background: sel ? "var(--accent-primary)" : "var(--bg-primary)",
                                        color: sel ? "#fff" : "var(--text-secondary)",
                                        padding: "2px 8px",
                                        cursor: "pointer",
                                        font: "inherit",
                                        fontSize: 11.5,
                                    }}
                                >
                                    <span>{label}</span>
                                    <span className="tabular" style={{ opacity: 0.85 }}>{b.pointCount}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 스크롤 영역 — 날짜 → 종목 → 타점. */}
            <div style={{ overflowY: "auto", flex: 1 }}>
                {groups.length === 0 && <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>{emptyText}</div>}
                {groups.map((g) => (
                    <div key={g.date}>
                        <DateHeader date={g.date} />
                        {g.stocks.map((e) => {
                            const sameCode = e.code === focusCode;
                            return (
                                <div
                                    key={e.code}
                                    ref={(el) => {
                                        const k = `${e.date}|${e.code}`;
                                        if (el) anchorRefs.current.set(k, el);
                                        else anchorRefs.current.delete(k);
                                    }}
                                >
                                    <button
                                        onClick={() => setFocus({ date: e.date, code: e.code, time: null })}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            width: "100%",
                                            textAlign: "left",
                                            border: "none",
                                            borderLeft: `3px solid ${sameCode ? "var(--accent-hover)" : "transparent"}`,
                                            padding: "3px 10px",
                                            cursor: "pointer",
                                            font: "inherit",
                                            background: sameCode ? "var(--accent-primary)" : "var(--bg-tertiary)",
                                        }}
                                    >
                                        <Name name={e.name} code={e.code} color={sameCode ? "#fff" : "var(--text-primary)"} strong={sameCode} />
                                    </button>
                                    {e.points.map((p) => (
                                        <PointRow
                                            key={`${p.date}-${p.time}`}
                                            p={p}
                                            related={sameCode}
                                            current={sameCode && p.date === focusDate && p.time === focusTime}
                                            onClick={() => goToPoint({ date: p.date, code: p.stockCode, time: p.time })}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
