import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { type ReviewPointListItem } from "../api/reviewPoints.js";
import { anchoredChartsQuery, allPointsQuery } from "../api/queries.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { MonthPicker, LocateIcon, DateHeader, Name, PointRow } from "./WorksetRows.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { usePlacements } from "../lib/usePlacements.js";

// 작업셋 패널 — 선 있는 (종목,날짜) ∪ 타점을 월별로 브라우징(연대순 진입). 타점 클릭 → date·code·time focus.

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
    const activePoint = useWorkbench((s) => s.activePoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const goToPoint = useWorkbench((s) => s.goToPoint);

    // 배치 현황(n/m) — 배치 여부를 알려면 어차피 전 축 줄이 필요하고, 그건 배치/시트 패널과 같은 캐시다(추가 페치 0).
    const placements = usePlacements();

    const stocksQ = useQuery(anchoredChartsQuery());
    const pointsQ = useQuery(allPointsQuery());
    const stocks = useMemo(() => stocksQ.data ?? [], [stocksQ.data]);
    const points = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);

    // ── 월별 계산.
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
    const groups = useMemo(() => {
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

    // ── w/s 타점 순회 — 현재 보이는 타점들(groups 평탄화)을 goToPoint 로 걷는다. 끝에서 clamp.
    //    전역 동적 커맨드(차트 a/d 선례) — navRef 로 최신 목록/현재타점을 읽어 등록은 1회.
    type NavPoint = { code: string; date: string; time: string };
    const flatPoints = useMemo<NavPoint[]>(() => {
        const out: NavPoint[] = [];
        for (const g of groups) for (const e of g.stocks) for (const p of e.points) out.push({ code: p.stockCode, date: p.date, time: p.time });
        return out;
    }, [groups]);
    const navRef = useRef<{ points: NavPoint[]; current: NavPoint | null; run: (dir: number) => void }>({ points: [], current: null, run: () => {} });
    navRef.current.points = flatPoints;
    navRef.current.current = activePoint;
    navRef.current.run = (dir): void => {
        const { points, current } = navRef.current;
        if (points.length === 0) return;
        const idx = current ? points.findIndex((p) => p.code === current.code && p.date === current.date && p.time === current.time) : -1;
        const ni = idx < 0 ? (dir > 0 ? 0 : points.length - 1) : Math.max(0, Math.min(points.length - 1, idx + dir));
        const t = points[ni];
        useWorkbench.getState().goToPoint({ date: t.date, code: t.code, time: t.time }, "workset");
    };
    useEffect(() => {
        const { register, unregister } = useKeymapDynamic.getState();
        register({ id: "workset.nav.prevPoint", title: "이전 타점(작업셋)", category: "작업셋", keys: "w", run: () => navRef.current.run(-1) });
        register({ id: "workset.nav.nextPoint", title: "다음 타점(작업셋)", category: "작업셋", keys: "s", run: () => navRef.current.run(1) });
        return () => { unregister("workset.nav.prevPoint"); unregister("workset.nav.nextPoint"); };
    }, []);

    // ── focus 추종 — 어디서 종목/시간이 바뀌든(외부·자기 w/s 공통) 그 종목으로 스크롤. 다른 달이면 그 달로 전환 후 스크롤(2단계).
    //    pendingScroll 로 달 전환 리렌더가 anchor 를 만든 다음 스크롤(한 번). block:"nearest" 라 이미 보이면 안 움직임.
    const pendingScroll = useRef<string | null>(null);
    useEffect(() => {
        if (!focusCode) return;
        pendingScroll.current = `${focusDate}|${focusCode}`;
        if (months.includes(monthOf(focusDate))) setSelMonth(monthOf(focusDate));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusCode, focusDate, focusTime]);
    useEffect(() => {
        const key = pendingScroll.current;
        if (!key) return;
        const code = key.slice(key.indexOf("|") + 1);
        const el = anchorRefs.current.get(key) ?? [...anchorRefs.current.entries()].find(([k]) => k.endsWith(`|${code}`))?.[1];
        if (el) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
            pendingScroll.current = null;
        } else if (monthOf(focusDate) === month) {
            pendingScroll.current = null; // 대상 달이 정착했는데 목록에 없음 → 포기(선 없는 종목 등)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, focusCode, focusDate]);

    if (stocksQ.isLoading || pointsQ.isLoading) return <BoardCenter text="작업셋 로딩중…" />;
    if (stocksQ.isError) return <BoardCenter text={`작업셋 오류: ${(stocksQ.error as Error).message}`} />;
    if (pointsQ.isError) return <BoardCenter text={`타점 오류: ${(pointsQ.error as Error).message}`} />;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            {/* 헤더 — 월 선택 + 조준 아이콘. */}
            <PanelHeader chrome={false} gap={0} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <MonthPicker month={month} months={months} onPick={setSelMonth} />
                {focusCode && (
                    <button
                        onClick={pinnedName ? scrollToCurrent : undefined}
                        disabled={!pinnedName}
                        title={pinnedName ? "현재 종목 위치로 스크롤" : "선택한 종목은 목록에 없습니다"}
                        style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", alignItems: "center", padding: "2px 3px", border: "none", background: "none", cursor: pinnedName ? "pointer" : "default", lineHeight: 0, opacity: pinnedName ? 1 : 0.35 }}
                    >
                        <LocateIcon />
                    </button>
                )}
            </PanelHeader>

            {/* 스크롤 영역 — 날짜 → 종목 → 타점. */}
            <div style={{ overflowY: "auto", flex: 1 }}>
                {groups.length === 0 && <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>이 달 항목 없음</div>}
                {groups.map((g) => (
                    <div key={g.date}>
                        <DateHeader date={g.date} />
                        {g.stocks.map((e) => {
                            // 선택 = 정확히 이 (날짜,종목) 항목. code 만 비교하면 같은 종목이 다른 날짜에도 있을 때 그 행들까지 선택 UI 가 켜진다.
                            const selected = e.code === focusCode && e.date === focusDate;
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
                                            borderLeft: `3px solid ${selected ? "var(--accent-hover)" : "transparent"}`,
                                            padding: "3px 10px",
                                            cursor: "pointer",
                                            font: "inherit",
                                            background: selected ? "var(--accent-primary)" : "var(--bg-tertiary)",
                                        }}
                                    >
                                        <Name name={e.name} code={e.code} color={selected ? "#fff" : "var(--text-primary)"} strong={selected} />
                                    </button>
                                    {e.points.map((p) => (
                                        <PointRow
                                            key={`${p.date}-${p.time}`}
                                            p={p}
                                            related={selected}
                                            current={selected && p.time === focusTime}
                                            placed={placements.countOf(p)}
                                            axisTotal={placements.axisTotal}
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
