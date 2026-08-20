import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";

import { allPointsQuery } from "../api/queries.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { PanelHeader, ScrollRow } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { WorksetFilterRow } from "./WorksetFilterRow.js";
import { HeaderPopover } from "../components/HeaderPopover.js";
import { WorksetList, type WorksetEntry, type WorksetLens } from "./WorksetList.js";
import { usePresenceIndex } from "../lib/usePresence.js";
import { useStockNames } from "../lib/useStockNames.js";
import { useGroups } from "../lib/GroupsContext.js";
import { usePersistedState } from "../store/persist.js";
import { pointKey, chartKeyOf } from "../lib/pointKey.js";
import { matchesPresenceDnf, hasActiveDnf, dnfSummary } from "../lib/presence.js";
import { applyMonthClick, normalizeMonths, MONTH_PICK_HINT } from "./filter/monthPick.js";
import { useFunnel } from "./filter/FunnelContext.js";
import type { SetRef } from "../lib/setRef.js";
import { setRefKey } from "../lib/setRef.js";
import { PIN } from "../styles/palette.js";

// 작업셋 패널 — **curation 흔적이 있는 (종목,날짜) 전부**를 브라우징한다(연대순 진입). E안 헤더 3줄:
//   ① 컨트롤 줄  : 좌측 = 상태 텍스트(N 표시 · M 숨김 · 필터 요약), 우측 = 레지스트리(좁히기·조준·더보기)
//   ② 칩 줄      : 집합 + 월 — 둘 다 **전역 시선**(selectedSetRef·gazeMonths). 여기가 조종석이고
//                  구독 패널(골격·시트·그룹목록)은 viewOf 가 접어 주는 것을 받는다
//   ③ 필터 줄    : 존재 필터 DNF(& = AND, | = OR) — 이것도 전역 시선(gazePresence, 영속).
//                  "남은 작업"(골격 채울 날 등)이 구독 패널에도 그대로 좁혀 보이는 이유
// 집합은 기본 **렌즈**(비멤버 흐리게 + 멤버 보라 레일)고 좁히기는 명시 토글. 목록은 평탄화+가상화
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
    const gazeMonths = useWorkbench((s) => s.gazeMonths);
    const setGazeMonths = useWorkbench((s) => s.setGazeMonths);

    const { nameOf } = useStockNames();
    const { groupsOf, pathLabel } = useGroups();
    const funnel = useFunnel();

    const presence = usePresenceIndex();
    const pointsQ = useQuery(allPointsQuery());
    const points = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);

    // ── 존재 필터(DNF) — **전역 시선**(store.gazePresence, 슬라이스가 영속·옛 키 승계). 여기가 주인이고
    //    구독 패널은 viewOf 가 접어 주는 것을 받는다 — "남은 작업"이 골격·시트에도 그대로 보이는 이유.
    const dnf = useWorkbench((s) => s.gazePresence);
    const setDnf = useWorkbench((s) => s.setGazePresence);

    // ── 월 시선 — **전역 하나**(store.gazeMonths, 기본=오늘의 달). 여기가 주인이고 구독 패널은
    //    viewOf 가 접어 주는 것을 그대로 받는다. null = 전체. 손짓은 깔때기 월 칩과 같은 순수 규칙
    //    (applyMonthClick — 맨클릭 갈아타기·Ctrl 토글·Shift 범위·마지막 하나 보호).
    const months = useMemo(() => {
        const set = new Set<string>();
        for (const d of presence.index.values()) set.add(monthOf(d.date));
        return [...set].sort().reverse();
    }, [presence.index]);
    const allMonths = gazeMonths === null;
    const picked = useMemo<ReadonlySet<string>>(
        () => (gazeMonths === null ? new Set<string>() : normalizeMonths(new Set(gazeMonths), months)),
        [gazeMonths, months],
    );
    const monthAnchor = useRef<string | null>(null);
    const clickMonth = (ym: string, mods: { ctrl: boolean; shift: boolean }): void => {
        const next = applyMonthClick(picked, months, mods.shift ? monthAnchor.current : null, ym, mods);
        if (!mods.shift) monthAnchor.current = ym;
        setGazeMonths([...next]);
    };

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
        const inMonth = (date: string): boolean => allMonths || picked.has(monthOf(date));
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
    }, [presence.index, points, allMonths, picked, dnf, narrowOn, view, memberPointKeys]);

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
        if (!allMonths && months.includes(fm) && !picked.has(fm)) { monthAnchor.current = fm; setGazeMonths([fm]); }
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
    // 칩 하나 — 줄에는 **선택 상태만** 선다("지금 뭘 보고 있나"의 요약이 곧 줄). 편집은 클릭 → 팝오버.
    const chip = (key: string, label: string, active: boolean, onClick: (e: React.MouseEvent) => void, opts?: { color?: string; title?: string; tabular?: boolean }): JSX.Element => (
        <button key={key} onClick={onClick} title={opts?.title}
            className={opts?.tabular ? "tabular" : undefined}
            style={{
                flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 11, padding: "1px 8px", borderRadius: 9,
                border: `0.5px solid ${active ? "transparent" : "var(--border-strong)"}`, whiteSpace: "nowrap",
                background: active ? (opts?.color ?? "var(--accent-primary)") : "transparent",
                color: active ? "#fff" : "var(--text-secondary)", fontWeight: active ? 700 : 400,
            }}>
            {label}
        </button>
    );
    const ym2 = (m: string): string => m.slice(2).replace("-", "."); // "2026-08" → "26.08"
    const setLabel = lensRef === null ? "전체" : lensRef.kind === "saved" ? (savedSets.find((s) => s.id === lensRef.setId)?.name ?? "(지워진 집합)") : "최종 생존";
    // 팝오버 정렬 — [전체][선택][나머지 최신순]. 긴 목록은 팝오버가 들고, 줄은 요약만 든다.
    type SetOption = { key: string; label: string; ref: SetRef | null };
    const setOptions: SetOption[] = ([
        { key: "none", label: "전체", ref: null },
        { key: "sv", label: "최종 생존", ref: { kind: "survivors" } },
        ...savedSets.map((s) => ({ key: s.id, label: s.name, ref: { kind: "saved", setId: s.id } })),
    ] as SetOption[]).sort((a, b) => {
        const rank = (o: { ref: SetRef | null }): number =>
            o.ref === null ? 0 : selectedSetRef !== null && setRefKey(o.ref) === setRefKey(selectedSetRef) ? 1 : 2;
        return rank(a) - rank(b);
    });
    const sortedMonths = [...months].sort((a, b) => {
        const rank = (m: string): number => (!allMonths && picked.has(m) ? 0 : 1);
        return rank(a) - rank(b) || (a < b ? 1 : -1); // 선택 먼저, 그 안에서 최신순
    });
    const pickedMonthsDesc = allMonths ? [] : [...picked].sort().reverse();

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            {/* ① 컨트롤 줄 — 좌측 상태 텍스트, 우측 레지스트리. */}
            <PanelHeader chrome={false} gap={6} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                    {shownCount} 표시{hasActiveDnf(dnf) || narrowOn ? ` · ${hiddenCount} 숨김` : ""}
                </span>
                {filterSummary && (
                    // 안 줄인다(flexShrink 0) — 헤더는 ScrollRow 라 넘치면 hover 가로 스크롤로 끝까지 읽는다
                    // (줄임표는 "정보를 다 못 보는" 상태를 만든다 — 사용자 확정).
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {filterSummary}
                    </span>
                )}
                <HeaderControls controls={controls} storageKey="wb.headerPins.workset" />
            </PanelHeader>

            {/* ② 칩 줄 — 집합(전역) + 월(로컬 시선). **선택 상태만** 줄에 서고, 클릭하면 팝오버에서 편집한다
                (전체 목록을 줄에 깔면 월 14개·집합 수 개가 폭을 다 먹는다 — 긴 목록은 팝오버의 몫). */}
            <ScrollRow gap={4} style={{ flexShrink: 0, padding: "3px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" }}>
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>집합</span>
                <HeaderPopover width={150} align="start" closeOnOutside
                    trigger={(_open, toggle) => chip("set", setLabel, lensRef !== null, toggle, { color: PIN, title: "클릭 = 집합 고르기 — 고르면 연동된 패널들이 함께 따라간다" })}>
                    {(close) => (
                        <div style={{ overflowY: "auto", padding: "2px 0" }}>
                            {setOptions.map((o) => {
                                const active = o.ref === null ? lensRef === null : selectedSetRef !== null && setRefKey(o.ref) === setRefKey(selectedSetRef);
                                return (
                                    <button key={o.key} onClick={() => { selectSet(o.ref); close(); }}
                                        style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: active ? "var(--accent-soft)" : "transparent", color: "var(--text-primary)", padding: "4px 10px", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: active ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {o.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </HeaderPopover>
                <span style={{ flexShrink: 0, width: 1, alignSelf: "stretch", background: "var(--border-default)", margin: "0 3px" }} />
                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>월</span>
                <HeaderPopover width={168} align="start" closeOnOutside
                    trigger={(_open, toggle) => (
                        <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                            {allMonths
                                ? chip("m-all", "전체", true, toggle, { title: "클릭 = 달 고르기" })
                                : pickedMonthsDesc.map((m) => chip(`m-${m}`, ym2(m), true, toggle, { title: `클릭 = 달 고르기 — ${MONTH_PICK_HINT}`, tabular: true }))}
                        </span>
                    )}>
                    {() => (
                        // 다중 선택이라 골라도 안 닫는다(바깥 클릭으로 닫기) — 정렬은 [전체][선택][나머지 최신순].
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, maxHeight: 180, overflowY: "auto" }}>
                            {chip("pm-all", "전체", allMonths, () => setGazeMonths(null), { title: "모든 달 — 시선 해제(목록은 가상화라 상한 없음)" })}
                            {sortedMonths.map((m) =>
                                chip(`pm-${m}`, ym2(m), !allMonths && picked.has(m), (e) => {
                                    clickMonth(m, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
                                }, { title: MONTH_PICK_HINT, tabular: true }),
                            )}
                        </div>
                    )}
                </HeaderPopover>
            </ScrollRow>

            {/* ③ 필터 줄 — 존재 필터 DNF. */}
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
