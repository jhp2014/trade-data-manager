import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";

import { allPointsQuery } from "../api/queries.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { PanelHeader, ScrollRow } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { WorksetFilterRow, dnfSummary } from "./WorksetFilterRow.js";
import { WorksetList, type WorksetEntry, type WorksetLens } from "./WorksetList.js";
import { usePlacements } from "../lib/usePlacements.js";
import { usePresenceIndex } from "../lib/usePresence.js";
import { useStockNames } from "../lib/useStockNames.js";
import { useGroups } from "../lib/GroupsContext.js";
import { usePersistedState } from "../store/persist.js";
import { pointKey, chartKeyOf } from "../lib/pointKey.js";
import { matchesPresenceDnf, hasActiveDnf, parsePresenceDnf, type PresenceDnf } from "../lib/presence.js";
import { useMonthPick, MONTH_PICK_HINT } from "./filter/monthPick.js";
import { useFunnel } from "./filter/FunnelContext.js";
import type { SetRef } from "../lib/setRef.js";
import { setRefKey } from "../lib/setRef.js";
import { PIN } from "../styles/palette.js";

// 작업셋 패널 — **curation 흔적이 있는 (종목,날짜) 전부**를 브라우징한다(연대순 진입). E안 헤더 3줄:
//   ① 컨트롤 줄  : 좌측 = 상태 텍스트(N 표시 · M 숨김 · 필터 요약), 우측 = 레지스트리(좁히기·조준·더보기)
//   ② 칩 줄      : 집합(전역 선택 포인터 — 여기서 고르면 연동 패널 전부가 따라간다) + 월(로컬 시선·다중)
//   ③ 절 줄      : 존재 필터 DNF(절 안 AND · 절 사이 OR) — 작업 패널 전용 개념(깔때기와 무관)
// 집합은 기본 **렌즈**(비멤버 흐리게 + 멤버 보라 레일)고 좁히기는 명시 토글. 월은 전파되지 않는
// 시선("달은 시선이지 조건이 아니다" — monthPick 철학)이라 저장하지 않는다. 목록은 평탄화+가상화
// (WorksetList) — 월 "전체" 시선의 최악 케이스(전 모수)가 상한이 없어야 해서다.

function monthOf(date: string): string {
    return date.slice(0, 7);
}

const parseBool = (raw: unknown): boolean | null => (typeof raw === "boolean" ? raw : null);

/** 작업셋이 렌즈로 삼는 집합 종류 — 저장 집합·최종 생존만(전체·해제는 렌즈 없음, 세션 종류는 애초에 포인터에 안 옴). */
const lensRefOf = (ref: SetRef | null): SetRef | null =>
    ref !== null && (ref.kind === "saved" || ref.kind === "survivors") ? ref : null;

export function WorksetPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const activePoint = useWorkbench((s) => s.activePoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const selectSet = useWorkbench((s) => s.selectSet);

    const placements = usePlacements();
    const { nameOf } = useStockNames();
    const { groupsOf, pathLabel } = useGroups();
    const funnel = useFunnel();

    const presence = usePresenceIndex();
    const pointsQ = useQuery(allPointsQuery());
    const points = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);

    // ── 존재 필터(DNF) — 영속. 옛 절-하나 형식은 parsePresenceDnf 가 [절] 로 승계한다.
    const [dnf, setDnf] = usePersistedState<PresenceDnf>("wb.workset.presenceFilter", parsePresenceDnf, []);

    // ── 월 시선 — 다중 선택(useMonthPick, 깔때기와 같은 손짓) + "전체"(시선 해제). 세션 상태(저장 안 함).
    const months = useMemo(() => {
        const set = new Set<string>();
        for (const d of presence.index.values()) set.add(monthOf(d.date));
        return [...set].sort().reverse();
    }, [presence.index]);
    const monthPick = useMonthPick(months);
    const [allMonths, setAllMonths] = useState(false);
    // 기본 = 현재(포커스) 달 — monthPick 의 기본은 최근 달이라, 첫 진입에 포커스 달로 맞춘다(1회).
    const bootRef = useRef(false);
    useEffect(() => {
        if (bootRef.current || months.length === 0) return;
        bootRef.current = true;
        const fm = monthOf(focusDate);
        if (months.includes(fm)) monthPick.click(fm, { ctrl: false, shift: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [months]);

    // ── 집합 — 전역 선택 포인터(selectedSetRef)를 여기서 정한다(작업셋 = 집합 선택의 집, 연동 패널이 구독).
    const lensRef = lensRefOf(selectedSetRef);
    const view = lensRef !== null ? funnel.viewOf(lensRef) : null;
    const lensOn = view !== null && view.isFiltering && !view.broken;
    const memberPointKeys = useMemo(
        () => (view === null ? new Set<string>() : new Set(view.viewedPointRefs.map((r) => pointKey(r)))),
        [view],
    );
    const [narrow, setNarrow] = usePersistedState<boolean>("wb.workset.narrow", parseBool, false);
    const narrowOn = narrow && lensOn;

    // ── 이 시선의 항목들 — 월(시선) → 존재 DNF(필터) → 좁히기(집합 멤버만). 숨김 수는 필터·좁히기 몫만
    //    센다(월은 페이지가 아니라 시선이라 "숨김"이 아니다).
    const { groups, shownCount, hiddenCount } = useMemo(() => {
        const inMonth = (date: string): boolean => allMonths || monthPick.picked.has(monthOf(date));
        const map = new Map<string, WorksetEntry>();
        let hidden = 0;
        for (const d of presence.index.values()) {
            if (!inMonth(d.date)) continue;
            if (!matchesPresenceDnf(d, dnf)) { hidden += 1; continue; }
            if (narrowOn && !view!.viewedChartKeys.has(chartKeyOf(d.stockCode, d.date))) { hidden += 1; continue; }
            map.set(`${d.date}|${d.stockCode}`, { date: d.date, code: d.stockCode, presence: d, points: [] });
        }
        for (const p of points) {
            if (!inMonth(p.date)) continue;
            if (narrowOn && !memberPointKeys.has(pointKey(p))) continue; // 좁히기 = 타점도 멤버만
            map.get(`${p.date}|${p.stockCode}`)?.points.push(p);
        }
        for (const e of map.values()) e.points.sort((a, b) => (a.time < b.time ? -1 : 1));
        const entries = [...map.values()].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.code < b.code ? -1 : 1));
        const out: { date: string; stocks: WorksetEntry[] }[] = [];
        for (const e of entries) {
            let g = out[out.length - 1];
            if (!g || g.date !== e.date) {
                g = { date: e.date, stocks: [] };
                out.push(g);
            }
            g.stocks.push(e);
        }
        return { groups: out, shownCount: entries.length, hiddenCount: hidden };
    }, [presence.index, points, allMonths, monthPick.picked, dnf, narrowOn, view, memberPointKeys]);

    // 렌즈 판정 — 종목 행은 그 날 밑에 멤버가 하나라도 있으면(부모가 자식 멤버십을 대표), 타점 행은 자신.
    const lens = useMemo<WorksetLens | null>(() => {
        if (!lensOn || narrowOn) return null; // 좁히기 중엔 전원이 멤버라 렌즈 표시는 소음이다
        return {
            dayMember: (e) => view!.viewedChartKeys.has(chartKeyOf(e.code, e.date)),
            pointMember: (p) => memberPointKeys.has(pointKey(p)),
        };
    }, [lensOn, narrowOn, view, memberPointKeys]);

    // ── 찾아가기(조준·포커스 추종) — 가상 목록이라 ref 대신 (날짜,종목)+nonce 로 지목(WorksetList.jumpTo).
    const [jump, setJump] = useState<{ date: string; code: string; nonce: number }>({ date: "", code: "", nonce: 0 });
    const canLocate = useMemo(() => {
        if (!focusCode) return false;
        for (const d of presence.index.values()) if (d.stockCode === focusCode) return true;
        return false;
    }, [focusCode, presence.index]);
    useEffect(() => {
        if (!focusCode) return;
        const fm = monthOf(focusDate);
        // 다른 달의 항목으로 포커스가 가면 그 달로 시선 전환(전체 시선이면 스크롤만).
        if (!allMonths && months.includes(fm) && !monthPick.picked.has(fm)) monthPick.click(fm, { ctrl: false, shift: false });
        setJump((j) => ({ date: focusDate, code: focusCode, nonce: j.nonce + 1 }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusCode, focusDate, focusTime]);

    // ── w/s 타점 순회 — 보이는 타점(필터·좁히기 통과분)만 걷는다. 전역 동적 커맨드(차트 a/d 선례).
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

    // ── 헤더 컨트롤(레지스트리) — 좁히기는 렌즈가 설 때만 의미가 있어 그때만 나타난다.
    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "toggle", id: "narrow", name: "좁히기", activeColor: PIN, available: lensOn,
            help: "집합 멤버만 남기기 — 끄면 렌즈(비멤버 흐리게)", on: narrow, set: () => setNarrow((v) => !v),
        },
        {
            kind: "action", id: "locate", name: "조준", disabled: !canLocate,
            help: "현재 종목 위치로 스크롤",
            run: () => setJump((j) => ({ date: focusDate, code: focusCode, nonce: j.nonce + 1 })),
        },
    ], [lensOn, narrow, setNarrow, canLocate, focusDate, focusCode]);

    if (presence.isLoading || pointsQ.isLoading) return <BoardCenter text="작업셋 로딩중…" />;
    if (presence.error) return <BoardCenter text={`작업셋 오류: ${presence.error.message}`} />;
    if (pointsQ.isError) return <BoardCenter text={`타점 오류: ${(pointsQ.error as Error).message}`} />;

    const filterSummary = dnfSummary(dnf);
    const setChip = (label: string, ref: SetRef | null, key: string): JSX.Element => {
        const active = ref === null ? lensRefOf(selectedSetRef) === null : selectedSetRef !== null && setRefKey(selectedSetRef) === setRefKey(ref);
        return (
            <button key={key} onClick={() => selectSet(ref)}
                title={ref === null ? "집합 렌즈 해제" : "이 집합을 선택 — 연동된 패널들이 함께 따라간다"}
                style={{
                    flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 11, padding: "1px 8px", borderRadius: 9,
                    border: `0.5px solid ${active ? "transparent" : "var(--border-strong)"}`, whiteSpace: "nowrap",
                    background: active ? PIN : "transparent", color: active ? "#fff" : "var(--text-secondary)", fontWeight: active ? 700 : 400,
                }}>
                {label}
            </button>
        );
    };
    const monthChip = (label: string, active: boolean, onClick: (e: React.MouseEvent) => void, title?: string): JSX.Element => (
        <button key={label} onClick={onClick} title={title}
            className="tabular"
            style={{
                flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 11, padding: "1px 8px", borderRadius: 9,
                border: `0.5px solid ${active ? "transparent" : "var(--border-strong)"}`, whiteSpace: "nowrap",
                background: active ? "var(--accent-primary)" : "transparent", color: active ? "#fff" : "var(--text-secondary)", fontWeight: active ? 700 : 400,
            }}>
            {label}
        </button>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            {/* ① 컨트롤 줄 — 좌측 상태 텍스트, 우측 레지스트리. */}
            <PanelHeader chrome={false} gap={6} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                    {shownCount} 표시{hasActiveDnf(dnf) || narrowOn ? ` · ${hiddenCount} 숨김` : ""}
                </span>
                {filterSummary && (
                    <span title={filterSummary} style={{ minWidth: 0, fontSize: 10.5, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {filterSummary}
                    </span>
                )}
                <HeaderControls controls={controls} storageKey="wb.headerPins.workset" />
            </PanelHeader>

            {/* ② 칩 줄 — 집합(전역) + 월(로컬 시선). 넘치면 hover 가로 스크롤(ScrollRow 규약). */}
            <ScrollRow gap={4} style={{ flexShrink: 0, padding: "3px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" }}>
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>집합</span>
                {setChip("전체", null, "set-none")}
                {setChip("최종 생존", { kind: "survivors" }, "set-sv")}
                {savedSets.map((s) => setChip(s.name, { kind: "saved", setId: s.id }, `set-${s.id}`))}
                <span style={{ flexShrink: 0, width: 1, alignSelf: "stretch", background: "var(--border-default)", margin: "0 3px" }} />
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>월</span>
                {monthChip("전체", allMonths, () => setAllMonths(true), "모든 달 — 시선 해제(목록은 가상화라 상한 없음)")}
                {months.map((m) =>
                    monthChip(m.replace("-", "."), !allMonths && monthPick.picked.has(m), (e) => {
                        setAllMonths(false);
                        monthPick.click(m, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
                    }, MONTH_PICK_HINT),
                )}
            </ScrollRow>

            {/* ③ 절 줄 — 존재 필터 DNF. */}
            <WorksetFilterRow dnf={dnf} onChange={setDnf} />

            {groups.length === 0 ? (
                <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>
                    {hiddenCount > 0 ? `표시할 항목 없음 — 필터·좁히기로 ${hiddenCount}건 숨김` : "이 시선에 항목 없음"}
                </div>
            ) : (
                <WorksetList
                    groups={groups}
                    focus={{ code: focusCode, date: focusDate, time: focusTime }}
                    lens={lens}
                    nameOf={nameOf}
                    placedOf={(p) => placements.countOf(p)}
                    axisTotal={placements.axisTotal}
                    groupsOf={(p) => groupsOf({ stockCode: p.stockCode, date: p.date, time: p.time })}
                    pathOf={(id) => pathLabel(id, "(지워짐)")}
                    onPickDay={(e) => setFocus({ date: e.date, code: e.code, time: null })}
                    onPickPoint={(p) => goToPoint({ date: p.date, code: p.stockCode, time: p.time })}
                    jumpTo={jump.code ? jump : undefined}
                />
            )}
        </div>
    );
}
