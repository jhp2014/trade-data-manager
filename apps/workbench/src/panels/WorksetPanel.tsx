import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { type ReviewPointListItem } from "../api/reviewPoints.js";
import { allPointsQuery } from "../api/queries.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { MonthPicker, LocateIcon, DateHeader, Name, PointRow, PresenceFilterRow } from "./WorksetRows.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { PresenceBadges } from "../components/PresenceBadges.js";
import { usePlacements } from "../lib/usePlacements.js";
import { usePresenceIndex } from "../lib/usePresence.js";
import { useStockNames } from "../lib/useStockNames.js";
import { useGroups } from "../lib/GroupsContext.js";
import { usePersistedState } from "../store/persist.js";
import { matchesPresence, nextTriState, type DayPresence, type PresenceFilter, type TriState } from "../lib/presence.js";

// 작업셋 패널 — **curation 흔적이 있는 (종목,날짜) 전부**를 월별로 브라우징(연대순 진입).
// 모수는 존재 지도(usePresenceIndex: 앵커 전 param ∪ 타점 ∪ 그룹 ∪ 코멘트) — 옛 "기준선 ∪ 타점"이
// 놓치던 골격만/그룹만/코멘트만 있는 날도 올라오고, 종류 배지 + 3상 필터 칩(AND)으로 걸러 본다.
// 타점 클릭 → date·code·time focus. 종목명은 부팅 사전(useStockNames) — 피드의 name 잔재는 안 읽는다.

function monthOf(date: string): string {
    return date.slice(0, 7);
}

interface StockEntry {
    date: string;
    code: string;
    presence: DayPresence;
    points: ReviewPointListItem[];
}

// 날짜 내림차순, 같은 날 종목코드 오름차순 → 날짜로 그룹.
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

// 영속 필터 복원 — 아는 상태값만 살린다(깨진 저장값이 "전부 숨김"으로 오독되면 안 된다).
function parseFilter(raw: unknown): PresenceFilter | null {
    if (typeof raw !== "object" || raw === null) return null;
    const out: Record<string, TriState> = {};
    for (const [k, v] of Object.entries(raw)) if (v === "has" || v === "not") out[k] = v;
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
    const { nameOf } = useStockNames();
    const { groupsOf, pathLabel } = useGroups();

    const presence = usePresenceIndex();
    const pointsQ = useQuery(allPointsQuery());
    const points = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);

    // 존재 필터(3상 × AND) — 영속. 기본은 전부 "무관"(모수를 넓힌 대신 기본값에 필터를 심지 않는다).
    const [filter, setFilter] = usePersistedState<PresenceFilter>("wb.workset.presenceFilter", parseFilter, {});
    const cycleKind = (key: string): void =>
        setFilter((f) => {
            const next = nextTriState(f[key] ?? "any");
            const out = { ...f } as Record<string, TriState>;
            if (next === "any") delete out[key];
            else out[key] = next;
            return out;
        });

    // ── 월별 계산 — 월 목록은 **필터 무관**(지도 전체): 필터를 걸었다고 달이 사라지면 길을 잃는다.
    const months = useMemo(() => {
        const set = new Set<string>();
        for (const d of presence.index.values()) set.add(monthOf(d.date));
        return [...set].sort().reverse();
    }, [presence.index]);
    const [selMonth, setSelMonth] = useState<string | null>(null);
    const month = useMemo(() => {
        if (selMonth && months.includes(selMonth)) return selMonth;
        const fm = monthOf(focusDate);
        return months.includes(fm) ? fm : (months[0] ?? fm);
    }, [selMonth, months, focusDate]);

    // 이 달 항목 — 지도에서 필터를 통과한 (종목,날짜)만, 타점은 살아남은 항목에 자식으로.
    const { groups, hiddenCount } = useMemo(() => {
        const map = new Map<string, StockEntry>();
        let hidden = 0;
        for (const d of presence.index.values()) {
            if (monthOf(d.date) !== month) continue;
            if (!matchesPresence(d, filter)) {
                hidden += 1;
                continue;
            }
            map.set(`${d.date}|${d.stockCode}`, { date: d.date, code: d.stockCode, presence: d, points: [] });
        }
        for (const p of points) {
            if (monthOf(p.date) !== month) continue;
            map.get(`${p.date}|${p.stockCode}`)?.points.push(p);
        }
        for (const e of map.values()) e.points.sort((a, b) => (a.time < b.time ? -1 : 1));
        return { groups: groupByDate([...map.values()]), hiddenCount: hidden };
    }, [presence.index, points, month, filter]);

    // 핀 — 현재 종목이 지도에 있으면 그 위치로 스크롤(이름은 부팅 사전).
    const pinnedName = useMemo(() => {
        if (!focusCode) return null;
        for (const d of presence.index.values()) if (d.stockCode === focusCode) return nameOf(focusCode) ?? focusCode;
        return null;
    }, [focusCode, presence.index, nameOf]);

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
            pendingScroll.current = null; // 대상 달이 정착했는데 목록에 없음 → 포기(흔적 없는 종목·필터로 숨음)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, focusCode, focusDate]);

    if (presence.isLoading || pointsQ.isLoading) return <BoardCenter text="작업셋 로딩중…" />;
    if (presence.error) return <BoardCenter text={`작업셋 오류: ${presence.error.message}`} />;
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

            {/* 존재 필터 칩 — 3상 순환(무관→있음→없음), 켜진 칩 AND. 항상 보인다(숨은 필터는 사고). */}
            <PresenceFilterRow filter={filter} hidden={hiddenCount} onCycle={cycleKind} onClear={() => setFilter({})} />

            {/* 스크롤 영역 — 날짜 → 종목 → 타점. */}
            <div style={{ overflowY: "auto", flex: 1 }}>
                {groups.length === 0 && (
                    <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>
                        {hiddenCount > 0 ? `이 달 항목 없음 — 필터로 ${hiddenCount}건 숨김` : "이 달 항목 없음"}
                    </div>
                )}
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
                                            gap: 6,
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
                                        <Name name={nameOf(e.code)} code={e.code} color={selected ? "#fff" : "var(--text-primary)"} strong={selected} />
                                        <PresenceBadges presence={e.presence} style={{ marginLeft: "auto" }} />
                                    </button>
                                    {e.points.map((p) => (
                                        <PointRow
                                            key={`${p.date}-${p.time}`}
                                            p={p}
                                            related={selected}
                                            current={selected && p.time === focusTime}
                                            placed={placements.countOf(p)}
                                            axisTotal={placements.axisTotal}
                                            groups={groupsOf({ stockCode: p.stockCode, date: p.date, time: p.time })}
                                            pathOf={(id) => pathLabel(id, "(지워짐)")}
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
