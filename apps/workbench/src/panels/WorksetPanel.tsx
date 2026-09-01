import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench } from "../store/workbench.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";

import { usePointRows } from "../lib/usePointRows.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { FILTER_PRESETS, isPresetActive, WorksetFilterRow } from "./WorksetFilterRow.js";
import { WorksetList, type WorksetEntry, type WorksetLens } from "./WorksetList.js";
import {
    ChipRow, DEFAULT_ROW_STATE, parseRowState, WORKSET_ROW_IDS, WORKSET_ROW_LABEL, WorksetRowShell,
    type ChipItem, type WorksetRowId, type WorksetRowState,
} from "./WorksetChipRow.js";
import { usePresenceIndex } from "../lib/usePresence.js";
import { useStockNames } from "../lib/useStockNames.js";
import { useGroups } from "../lib/GroupsContext.js";
import { useSubject } from "../lib/subject.js";
import { usePersistedState } from "../store/persist.js";
import { pointKey, chartKeyOf } from "../lib/pointKey.js";
import { matchesPresenceDnf, hasActiveDnf, dnfSummary } from "../lib/presence.js";
import { applyMonthClick, normalizeMonths, MONTH_PICK_HINT } from "./filter/monthPick.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { linkedTargetLabel, setRefLabel } from "./filter/useSetBinding.js";
import { PIN } from "../styles/palette.js";
import { openAndFocus } from "../lib/openPanel.js";

// 작업셋 패널 — **curation 흔적이 있는 (종목,날짜) 전부**를 브라우징한다(연대순 진입).
// 머리글 = 컨트롤 줄 + **채널 줄 셋**(월·필터·프리셋 — 각자 한 줄):
//   ① 컨트롤 줄  : 좌측 = **보는 집합 라벨**(읽기전용 — 클릭하면 집합 편성 패널로) + 상태 텍스트
//                  (N 표시 · M 숨김), 우측 = 레지스트리(좁히기·조준·줄 토글·더보기)
//   ③ 월 줄      : 전역 월 시선(gazeMonths). null = 전체(기본)
//   ④ 필터 줄    : 존재 필터 DNF(& = AND, | = OR) — 이것도 전역 시선(gazePresence, 영속).
//                  "남은 작업"(골격 채울 날 등)이 구독 패널에도 그대로 좁혀 보이는 이유
//   ⑤ 프리셋 줄  : 자주 쓰는 DNF 의 이름. 클릭 = **통째 교체**(사용자 확정) — 다시 누르면 해제
//
// 채널을 한 줄씩 가른 이유: 한 줄에 둘을 넣으면(옛 "집합 + 월") 어느 칩이 어느 채널인지 구분자 하나에
// 매이고, 후보를 펼칠 자리가 아예 없다. 줄마다 표시/숨김(머리글 토글)과 펼침/접힘(줄 이름 클릭)이
// 따로 사는 이유는 WorksetChipRow 주석에.
//
// **두 패널의 경계**(2026-08-22 사용자 확정): 이 패널은 **시선**(월·존재 필터 — 집합을 낳지 않고 보는
// 방식만 바꾼다, 저장 집합에 안 딸린다)의 집이고, **조건**(그룹·축·날짜 — 집합을 낳아 저장물에 사본으로
// 딸린다)과 **집합 고르기**는 집합 편성 패널(SetRow)의 집이다. "본격/편의"로 가르지 않는다 — 정도 기준은
// 한 칸씩 밀려 같은 조건의 집이 둘이 된다(옛 필터 UI 두 곳 사고). 그래서 그룹 필터는 여기 안 들어온다:
// 편성에서 그룹 레일을 그으면 이 목록이 그 결과를 받는다. 집합 포인터는 여기서 **읽기만** 한다.
// 집합은 기본 **렌즈**(비멤버 흐리게 + 멤버 보라 레일)고 좁히기는 명시 토글. 목록은 평탄화+가상화
// (WorksetList) — 월 "전체" 시선의 최악 케이스(전 모수)가 상한이 없어야 해서다.

function monthOf(date: string): string {
    return date.slice(0, 7);
}

const parseBool = (raw: unknown): boolean | null => (typeof raw === "boolean" ? raw : null);


export function WorksetPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const goToDay = useWorkbench((s) => s.goToDay);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const savedSets = useWorkbench((s) => s.savedSets);
    const selectedSetRef = useWorkbench((s) => s.selectedSetRef);
    const funnelSelection = useWorkbench((s) => s.funnelSelection);
    const gazeMonths = useWorkbench((s) => s.gazeMonths);
    const setGazeMonths = useWorkbench((s) => s.setGazeMonths);

    const { nameOf } = useStockNames();
    const { chartGroupsOf, pathLabel } = useGroups();
    const subject = useSubject();
    const funnel = useFunnel();

    const presence = usePresenceIndex();
    const pts = usePointRows(); // point 행 원천(격자 파생 한 벌)
    const points = pts.points;

    // ── 존재 필터(DNF) — **전역 시선**(store.gazePresence, 슬라이스가 영속·옛 키 승계). 여기가 주인이고
    //    구독 패널은 viewOf 가 접어 주는 것을 받는다 — "남은 작업"이 골격·시트에도 그대로 보이는 이유.
    const dnf = useWorkbench((s) => s.gazePresence);
    const setDnf = useWorkbench((s) => s.setGazePresence);

    // ── 월 시선 — **전역 하나**(store.gazeMonths, 기본=전체). 여기가 주인이고 구독 패널은
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

    // ── 집합 — 전역 선택 포인터(selectedSetRef)를 **읽는다**(고르는 자리는 집합 편성의 SetRow 하나).
    //    렌즈 규칙은 구독 패널과 같은 한 줄 — 보는 집합이 "걸려 있으면" 렌즈다(작업셋만 다른 규칙을 두면
    //    옆 패널은 좁아졌는데 여기만 무반응인 어긋남이 생긴다). 전체는 걸림이 아니므로 렌즈가 안 선다.
    const isUniverse = selectedSetRef?.kind === "universe";
    // 보는 집합의 이름 — 어휘는 집합 줄과 같은 한 벌(setRefLabel/linkedTargetLabel). 클릭 = 집합 편성 패널로
    // (닫혀 있으면 연다) — 고르는 손은 거기 하나뿐이라 여기는 길만 낸다.
    const setLabel = selectedSetRef === null
        ? linkedTargetLabel(funnelSelection !== null, funnel.active.length)
        : setRefLabel(selectedSetRef, savedSets);
    const goToFunnelPanel = (): void => openAndFocus("filter-funnel-1");
    const linkedView = funnel.viewOf(null);
    const view = isUniverse ? null : linkedView;
    const lensOn = view !== null && view.isFiltering && !view.broken;
    const memberPointKeys = useMemo(
        () => (view === null ? new Set<string>() : new Set(view.viewedPointRefs.map((r) => pointKey(r)))),
        [view],
    );
    const [narrow, setNarrow] = usePersistedState<boolean>("wb.workset.narrow", parseBool, false);
    const narrowOn = narrow && lensOn;

    // ── 채널 줄 상태 — 표시·펼침·핀(영속). 한 키에 통째로(WorksetChipRow 주석).
    const [rows, setRows] = usePersistedState<WorksetRowState>("wb.workset.rows", parseRowState, DEFAULT_ROW_STATE);
    const toggleRowShown = (id: WorksetRowId): void =>
        setRows((r) => ({ ...r, shown: { ...r.shown, [id]: !r.shown[id] } }));
    const toggleRowExpanded = (id: WorksetRowId): void =>
        setRows((r) => ({ ...r, expanded: { ...r.expanded, [id]: !r.expanded[id] } }));
    const togglePin = (id: WorksetRowId, key: string): void =>
        setRows((r) => ({
            ...r,
            pins: { ...r.pins, [id]: r.pins[id].includes(key) ? r.pins[id].filter((k) => k !== key) : [...r.pins[id], key] },
        }));

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
        // 타점 정렬은 여기서 다시 하지 않는다 — 원천(usePointRows)이 "날짜↓·시각↑"을 계약으로 준다.
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
    // 순회 커서 = 지금 고른 타점(subject) — 없으면(하루 선택) 목록 끝에서 시작한다.
    navRef.current.current = subject && subject.time !== null ? { code: subject.code, date: subject.date, time: subject.time } : null;
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
        // 채널 줄 토글 넷 — **화면 구성**이라 컨트롤의 일이다(그 줄 안의 펼침/접힘은 줄 이름이 진다).
        // 선언은 목록에서 접는다: 줄이 늘거나 줄면 여기가 아니라 WORKSET_ROW_IDS 만 바뀐다.
        ...WORKSET_ROW_IDS.map((id): ControlSpec => ({
            kind: "toggle", id: `row.${id}`, name: `${WORKSET_ROW_LABEL[id]} 줄`, group: "줄",
            help: `${WORKSET_ROW_LABEL[id]} 채널 줄을 이 패널에 둘까`,
            on: rows.shown[id], set: () => toggleRowShown(id),
        })),
    ], [lensOn, narrow, setNarrow, canLocate, focusDate, focusCode, rows.shown]);

    if (presence.isLoading || pts.isLoading) return <BoardCenter text="작업셋 로딩중…" />;
    if (presence.error) return <BoardCenter text={`작업셋 오류: ${presence.error.message}`} />;
    if (pts.error) return <BoardCenter text={`타점 오류: ${pts.error.message}`} />;

    // 필터 요약은 **필터 줄이 꺼져 있을 때만** 머리글에 선다 — 줄이 켜져 있으면 식 전체가 이미 보인다.
    const filterSummary = rows.shown.filter ? "" : dnfSummary(dnf);
    const ym2 = (m: string): string => m.slice(2).replace("-", "."); // "2026-08" → "26.08"

    // ── 채널별 칩 목록 — 줄은 이 모양만 안다(ChipItem). 순서는 **선언 순서 고정**: 고른 것을 앞으로
    //    당기면 클릭할 때마다 칩이 자리를 바꿔 다음 클릭이 빗나간다(옛 팝오버는 정렬했지만 그건 판이라
    //    괜찮았다 — 줄은 손이 반복해 찍는 자리다).
    const monthItems: ChipItem[] = [
        { key: "all", label: "전체", active: allMonths, title: "모든 달 — 시선 해제(목록은 가상화라 상한 없음)", onClick: () => setGazeMonths(null) },
        ...months.map((m): ChipItem => ({
            key: m, label: ym2(m), active: !allMonths && picked.has(m), tabular: true, title: MONTH_PICK_HINT,
            onClick: (e) => clickMonth(m, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }),
        })),
    ];

    const presetItems: ChipItem[] = FILTER_PRESETS.map((p): ChipItem => {
        const on = isPresetActive(dnf, p.clause);
        return {
            key: p.name, label: p.name, active: on,
            title: on ? `${p.name} — 클릭 = 해제(필터 비움)` : `${p.name} — 클릭 = 이 필터로 통째 교체`,
            onClick: () => setDnf(on ? [] : [p.clause]),
        };
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            {/* ① 컨트롤 줄 — 좌측 상태 텍스트, 우측 레지스트리. */}
            <PanelHeader chrome={false} gap={6} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <button onClick={goToFunnelPanel}
                    title={`지금 보는 집합: ${setLabel} — 집합 편성 패널이 정한다(클릭 = 그 패널로)`}
                    style={{
                        flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 700, padding: "0 7px",
                        borderRadius: 9, border: "0.5px solid transparent", background: PIN, color: "#fff", whiteSpace: "nowrap",
                        maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                    {setLabel}
                </button>
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

            {rows.shown.month && (
                <ChipRow id="month" items={monthItems} expanded={rows.expanded.month} onToggleExpanded={() => toggleRowExpanded("month")}
                    pins={rows.pins.month} onTogglePin={(k) => togglePin("month", k)} />
            )}
            {/* 필터 줄만 껍데기를 밖에서 씌운다 — 펼침/접힘이 없어 ChipRow 가 아니다(칩이 아니라 식이다). */}
            {rows.shown.filter && (
                <WorksetRowShell label="필터" title="존재 필터 — 필터 안 AND · 필터 사이 OR">
                    <WorksetFilterRow dnf={dnf} onChange={setDnf}
                        {...(rows.shown.preset ? {} : { presets: FILTER_PRESETS })} />
                </WorksetRowShell>
            )}
            {rows.shown.preset && (
                <ChipRow id="preset" items={presetItems} expanded={rows.expanded.preset} onToggleExpanded={() => toggleRowExpanded("preset")}
                    pins={rows.pins.preset} onTogglePin={(k) => togglePin("preset", k)} />
            )}

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
                    groupsOf={(p) => chartGroupsOf({ stockCode: p.stockCode, date: p.date })}
                    pathOf={(id) => pathLabel(id, "(지워짐)")}
                    // goToDay — 하루를 고르는 손짓이라 시각을 **명시적으로 푼다**(time: null).
                    // 안 그러면 옛 시각이 남아 그 차트의 자동 타점을 우연히 가리키는 순간 하루 선택이 아니게 된다.
                    onPickDay={(e) => goToDay({ date: e.date, code: e.code })}
                    onPickPoint={(p) => goToPoint({ date: p.date, code: p.stockCode, time: p.time })}
                    jumpTo={jump.code ? jump : undefined}
                />
            )}
        </div>
    );
}
