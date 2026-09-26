import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hmsToMinute, minuteToHms } from "@trade-data-manager/market/domain";
import { DAILY_GEN_PANEL_ID } from "./dailyGen/dailyPanelIds.js";
import { selectObservedSetId, selectObservedStages, useWorkbench } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { DAY_SET_OPTS, useCellSet } from "./filter/useCellSet.js";
import type { CellHit } from "@trade-data-manager/market/domain";
import { dayRows, longitudinalRows, stepWithin, walkableOf, type DayCell } from "./workset/rows.js";
import { useDayCrossing } from "./workset/useDayCrossing.js";
import { neighborDates } from "./workset/dayCrossing.js";
import { useDayReplayPrefetch } from "../lib/useDaySnapshot.js";
import { useQuery } from "@tanstack/react-query";
import { dataDatesQuery } from "../api/queries.js";
import { useHasDataOn } from "../lib/useSnapFocusDate.js";
import { usePublishRowNav } from "../lib/rowNav.js";
import { RowNavBadge } from "../components/RowNavBadge.js";

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
import { setDisplayName } from "./filter/label.js";
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


/** 종단일 때 셀 평가를 끄는 상수 — 빈 배열 리터럴이면 매 렌더 새 참조라 memo 가 헛돈다. */
const EMPTY_CELLS: DayCell[] = [];
const EMPTY_DATES: string[] = [];
const EMPTY_HITS: CellHit[] = [];

export function WorksetPanel({ panelId }: { panelId?: string }): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const goToDay = useWorkbench((s) => s.goToDay);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const savedSets = useWorkbench((s) => s.savedSets);
    const gazeMonths = useWorkbench((s) => s.gazeMonths);
    const setGazeMonths = useWorkbench((s) => s.setGazeMonths);

    const { nameOf } = useStockNames();
    const { pointGroupsOf, pathLabel } = useGroups();
    const subject = useSubject();
    const funnel = useFunnel();

    const presence = usePresenceIndex();
    const pts = usePointRows(); // point 행 원천(격자 파생 한 벌)
    const points = pts.points;

    // ── 하루·셀 우주 — 편집 중인 집합의 타입이 이 패널의 모습을 정한다(decisions 「집합」 단계 ③).
    //    종단이면 지금까지의 3층 목록 그대로, 하루면 그날의 셀 ∪ 라벨 2층 목록이 된다.
    // ⚠ 라우팅의 자는 **모드**다(2026-09-22) — 파생은 조건 0개면 종단으로 떨어진다.
    const stages = useWorkbench(selectObservedStages);
    const isDaily = useWorkbench((s) => s.filterMode) === "daily";
    const pid = panelId ?? "workset";
    const [sortMode, setSortMode] = usePanelUi<"stock" | "time">(pid, "daySort", "stock");
    const [collapsedCodes, setCollapsedCodes] = usePanelUi<string[]>(pid, "dayCollapsed", []);
    const [showLabels, setShowLabels] = usePanelUi(pid, "dayLabels", true);
    const [datePinned, setDatePinned] = usePanelUi(pid, "datePin", false);
    // 셀 평가 — 상한은 **종목 그룹째** 자른다(반토막이면 머리의 ◇ n 이 거짓말을 한다).
    // 식·저장물은 깔때기의 **늦은 한 벌**(slowExpr/slowSets) — 종단과 같은 박자여야 수가 안 갈린다.
    const cellSet = useCellSet(isDaily ? funnel.slowExpr : null, funnel.slowSets, focusDate, DAY_SET_OPTS);
    const pointMemberships = useGroups().pointMemberships;

    /**
     * 그날의 좌표들 — 조건이 뽑은 셀 ∪ **라벨**(조건이 지우지 못한다 · 조건이 비어도 선다).
     *
     * ⚠ `tooWide`(그물 50,000셀 도달) 면 **조건 층을 통째로 뺀다**. 엔진은 중단 시점까지 모은 셀을
     * 그대로 돌려주는데, 그건 "코드 오름차순 앞 종목만"이라 목록으로 세우면 조용히 편향된 표본을
     * 진짜 산출물처럼 보여 준다(순회도 그 위를 걷는다). 라벨 층은 조건과 무관하므로 남는다 —
     * 화면은 대신 그 사실을 말한다(아래 tooWide 띠).
     */
    const dayCells = useMemo<DayCell[]>(() => {
        if (!isDaily) return EMPTY_CELLS;
        const byKey = new Map<string, DayCell>();
        for (const h of cellSet.tooWide ? EMPTY_HITS : cellSet.hits) {
            byKey.set(`${h.code}|${h.min}`, { code: h.code, min: h.min, time: minuteToHms(h.min), hit: h, labeled: false });
        }
        if (showLabels) {
            for (const m of pointMemberships) {
                if (m.date !== focusDate) continue;
                const min = hmsToMinute(m.time);
                const k = `${m.stockCode}|${min}`;
                const prev = byKey.get(k);
                if (prev) byKey.set(k, { ...prev, labeled: true });
                else byKey.set(k, { code: m.stockCode, min, time: m.time, hit: null, labeled: true });
            }
        }
        return [...byKey.values()];
    }, [isDaily, cellSet.tooWide, cellSet.hits, showLabels, pointMemberships, focusDate]);

    const collapsedSet = useMemo(() => new Set(collapsedCodes), [collapsedCodes]);
    const toggleCollapse = useCallback((code: string) => {
        setCollapsedCodes((v) => (v.includes(code) ? v.filter((c) => c !== code) : [...v, code]));
    }, [setCollapsedCodes]);
    // 날짜가 **바뀌면** 접힘을 푼다 — 어제 접은 종목이 오늘 접혀 있으면 놓친다(decisions 규칙 ③).
    // ⚠ 마운트에서는 풀지 않는다: effect 는 첫 렌더에도 도므로 그냥 두면 프리셋 전환·새로고침마다
    //   같은 날짜인데도 저장된 접힘이 지워진다(노브를 영속시킨 뜻이 접힘에서만 사라진다).
    const lastDate = useRef(focusDate);
    useEffect(() => {
        if (lastDate.current === focusDate) return;
        lastDate.current = focusDate;
        setCollapsedCodes([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusDate]);

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

    // ── 집합 — **관측 집합 하나**를 읽는다(2026-09-22: 고르는 포인터가 없어졌다).
    //    렌즈 규칙은 구독 패널과 같은 한 줄 — 보는 집합이 "걸려 있으면" 렌즈다(작업셋만 다른 규칙을 두면
    //    옆 패널은 좁아졌는데 여기만 무반응인 어긋남이 생긴다).
    const observedId = useWorkbench(selectObservedSetId);
    // 이름 어휘는 집합 줄과 같은 한 벌(setDisplayName). 클릭 = 집합 편성 패널로(닫혀 있으면 연다).
    const setLabel = useMemo(() => {
        const f = savedSets.find((x) => x.id === observedId);
        return f ? setDisplayName(f, funnel.labelLook, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)") : "(지워진 집합)";
    }, [savedSets, observedId, funnel.labelLook]);
    const goToFunnelPanel = (): void => openAndFocus(DAILY_GEN_PANEL_ID);
    const view = funnel.view;
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

    // ── 목록 행 — **한 배열**이 목록과 순회의 공통 원천이다(두 벌이면 접힌 행을 순회가 밟는다).
    const listRows = useMemo(
        () => (isDaily ? dayRows(dayCells, focusDate, { sort: sortMode, collapsed: collapsedSet }) : longitudinalRows(groups)),
        [isDaily, dayCells, focusDate, sortMode, collapsedSet, groups],
    );

    // ── 날짜 경계 넘기(하루 우주 전용) — 종단은 날짜가 목록 안에 있어 경계가 없다.
    // 거래일 목록은 **하루 우주에서만** 필요하다(날짜 경계 넘기의 재료) — 종단 화면이 이 왕복을 물지 않게.
    const datesQ = useQuery({ ...dataDatesQuery(), enabled: isDaily });
    /** 그 날에 데이터가 있나 — 빈 화면이 "조건 탓"인지 "휴장"인지 가르는 재료(undefined = 아직 모름). */
    const hasData = useHasDataOn(focusDate);
    const heavyCondition = useMemo(
        () => cellSet.stages.some((st) => st.counted) && stages.some((st) => st.predicates.some((p) => p.kind === "gridPoint" || p.kind === "breakout" || (p.kind === "cellValue" && p.field === "zoneRank"))),
        [cellSet.stages, stages],
    );
    const landOn = useCallback((dir: 1 | -1) => {
        // 착지 — 방향에 맞는 끝 항목으로. 행은 이 렌더의 것이라 effect 가 아니라 콜백에서 읽는다.
        const order = walkableOf(dayRows(dayCells, focusDate, { sort: sortMode, collapsed: collapsedSet }));
        const to = dir > 0 ? order[0] : order[order.length - 1];
        if (to) useWorkbench.getState().goToPoint({ date: to.date, code: to.code, time: to.time ?? "" }, "workset");
    }, [dayCells, focusDate, sortMode, collapsedSet]);
    // 이웃 날짜 재료를 미리 당긴다 — 경계 넘기가 끊기지 않게(후보 계산은 미리 하지 않는다).
    useDayReplayPrefetch(isDaily ? focusDate : null, useMemo(() => neighborDates(datesQ.data ?? EMPTY_DATES, focusDate), [datesQ.data, focusDate]));
    const crossing = useDayCrossing({
        active: isDaily,
        dates: datesQ.data ?? EMPTY_DATES,
        ready: isDaily && !cellSet.isLoading,
        // 오류는 **빈 날이 아니다** — 0건으로 읽히면 자동 스킵이 실패한 15MB 요청을 10일치 날리고
        // 시선이 열흘 떨어진 곳에 남는다. 손짓을 버리고 그 자리에 멈춘다(매달림도 함께 풀린다).
        failed: cellSet.error !== null,
        count: isDaily ? walkableOf(listRows).length : 0,
        heavy: heavyCondition,
        pinned: datePinned,
        truncated: cellSet.truncated,
        onLand: landOn,
    });


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

    // ── w/s 타점 순회 — 보이는 타점(필터·좁히기 통과분)만 걷는다.
    //    여기선 순회 함수만 얹는다: 키 등록은 App 한 곳이고, **누가 걷는지는 사람이 고른다**
    //    (머리글 `w/s` 배지 · `q` 순환). 규칙 본문은 lib/rowNav 머리 주석.
    // **순회 순서 = 화면 순서**다 — 목록과 같은 `listRows` 에서 나온다(별도 배열이면 접힌 행을 밟는다).
    const order = useMemo(() => walkableOf(listRows), [listRows]);
    /** 지금 날짜를 넘겨도 되나 — **넘기는 중이면 안 된다**(연타가 하루씩 밀어낸다). */
    const canCross = isDaily && !cellSet.isLoading && !cellSet.tooWide && cellSet.error === null && !crossing.seeking;
    // 순회 커서 = 지금 고른 타점(subject) — 없으면(하루 선택) 목록 끝에서 시작한다.
    const navRef = usePublishRowNav("workset");
    navRef.current = (dir): void => {
        // 커서 — 우주마다 "지금 밟고 선 것"의 정의가 다르다.
        //  · 종단: subject(= focus.time 이 **라벨 좌표일 때만** 시각을 든다 — lib/subject).
        //  · 하루: focus.time 그대로. 이 우주의 행은 라벨이 아닌 좌표(◇ 후보)가 대다수라 subject 를
        //    쓰면 커서가 늘 null 로 떨어져 **s 를 눌러도 첫 행에서 안 나간다**(옛 탐색 후보 패널은
        //    자기 커서를 따로 들어 이 문제가 없었다 — 흡수하며 되살아난 자리).
        const cur = isDaily
            ? (focusTime !== null ? { code: focusCode, date: focusDate, time: focusTime } : null)
            : subject && subject.time !== null ? { code: subject.code, date: subject.date, time: subject.time } : null;
        const step = stepWithin(order, cur, dir > 0 ? 1 : -1);
        // 빈 목록(조건 0건·전부 접힘·진짜 빈 날)에서도 **날짜는 넘어가야 한다** — 안 그러면 자동 스킵이
        // 멈춘 그 빈 날에서 키보드만으로는 영영 못 빠져나간다.
        // ⚠ 단 **"빈 이유"를 가린다**: 로딩 중·tooWide·오류의 0건은 빈 날이 아니라 *아직 모르는* 날이다.
        //   가리지 않으면 계산 중에 누른 s 가 그 날을 버리고 다음 날로 밀며(연타마다 하루 + 15MB 요청),
        //   「목록이 안 그려지는 상태에선 w/s 도 멈춘다」가 깨진다.
        if (step === null) {
            if (canCross) crossing.cross(dir > 0 ? 1 : -1);
            return;
        }
        if (step.kind === "boundary") {
            // 하루 우주에서만 날짜를 넘긴다 — 종단은 날짜가 목록 안에 있어 경계가 없다.
            if (canCross) crossing.cross(step.dir);
            return;
        }
        useWorkbench.getState().goToPoint({ date: step.to.date, code: step.to.code, time: step.to.time ?? "" }, "workset");
    };

    // ── 헤더 컨트롤(레지스트리) — 좁히기는 렌즈가 설 때만 의미가 있어 그때만 나타난다.
    const controls = useMemo<ControlSpec[]>(() => [
        // ── 하루 우주의 손잡이 셋 — 종단에선 뜻이 없어 아예 안 선다(available).
        {
            kind: "toggle", id: "daySort", name: sortMode === "stock" ? "종목순" : "시간순", available: isDaily,
            help: "정렬 = 섹션 유무다. 종목순이면 종목 머리로 접히고, 시간순이면 장 흐름대로 평탄하게 선다",
            on: sortMode === "stock", set: () => setSortMode((v) => (v === "stock" ? "time" : "stock")),
        },
        {
            kind: "toggle", id: "dayLabels", name: "라벨", activeColor: PIN, available: isDaily,
            help: "◆ 라벨 좌표를 겹쳐 보기 — 조건이 지우지 못하는 층이다(끄면 조건이 뽑은 것만 남는다)",
            on: showLabels, set: () => setShowLabels((v) => !v),
        },
        {
            kind: "toggle", id: "datePin", name: "날짜 고정", available: isDaily,
            help: "목록 끝에서 w/s 가 날짜를 안 넘긴다 — '이 날만 보겠다'는 선언",
            on: datePinned, set: () => setDatePinned((v) => !v),
        },
        {
            kind: "toggle", id: "narrow", name: "좁히기", activeColor: PIN, available: lensOn && !isDaily,
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
    ], [lensOn, narrow, setNarrow, canLocate, focusDate, focusCode, rows.shown, isDaily, sortMode, setSortMode, showLabels, setShowLabels, datePinned, setDatePinned]);

    // ⚠ 훅은 **전부 게이트 위**에 있어야 한다 — 아래 early return 밑에 useMemo 를 하나라도 두면
    //    로딩 렌더에선 훅이 적고 완료 렌더에선 많아 React 가 "Rendered more hooks" 로 죽는다
    //    (첫 마운트마다 지나는 경로다 — 리뷰가 잡았다).
    const labelCount = useMemo(() => dayCells.filter((c) => c.labeled).length, [dayCells]);

    // 게이트도 우주별로 갈린다 — 하루 모드는 존재 지도·종단 타점을 안 쓴다(그 로딩을 기다릴 이유가 없다).
    if (isDaily) {
        if (cellSet.isLoading) return <BoardCenter text={`${focusDate} 후보 계산중…`} />;
        if (cellSet.error) return <BoardCenter text={`후보 오류: ${cellSet.error.message}`} />;
    } else {
        if (presence.isLoading || pts.isLoading) return <BoardCenter text="작업셋 로딩중…" />;
        if (presence.error) return <BoardCenter text={`작업셋 오류: ${presence.error.message}`} />;
        if (pts.error) return <BoardCenter text={`타점 오류: ${pts.error.message}`} />;
    }

    // 필터 요약은 **필터 줄이 꺼져 있을 때만** 머리글에 선다 — 줄이 켜져 있으면 식 전체가 이미 보인다.
    const filterSummary = rows.shown.filter ? "" : dnfSummary(dnf);
    const deficientCount = cellSet.stages.filter((st) => !st.counted).length;
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
                    title={`지금 보는 집합: ${setLabel} — 일별 타점[조건]이 정한다(클릭 = 그 패널로)`}
                    style={{
                        flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 700, padding: "0 7px",
                        borderRadius: 9, border: "0.5px solid transparent", background: PIN, color: "#fff", whiteSpace: "nowrap",
                        maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                    {setLabel}
                </button>
                <RowNavBadge owner="workset" />
                {isDaily ? (
                    <>
                        {/* 날짜는 **정의가 아니라 변수**다 — 전역 시선의 거울(고정하면 w/s 가 경계에서 멈춘다). */}
                        <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}
                            title="이 목록이 평가되는 날짜 — 전역 시선(차트·복기 보드와 같은 날). w/s 로 목록 끝에 닿으면 넘어간다">
                            {focusDate}{datePinned ? " 📌" : ""}
                        </span>
                        {/* 카운터는 **갈라 적는다** — 조건이 뽑은 셀과 겹쳐 놓인 라벨은 다른 층이다. */}
                        <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                            조건 {cellSet.matched.toLocaleString("ko-KR")}
                            {labelCount > 0 && <span style={{ color: PIN }}> · ◆ {labelCount}</span>}
                        </span>
                        {cellSet.tooWide && (
                            <span className="tabular" style={{ flexShrink: 0, fontSize: 10.5, color: "var(--fall)" }}
                                title="그물(5만 셀)에 걸려 평가를 중단했다 — 중단 시점까지 모인 셀은 앞 종목에 쏠려 있어 목록에서 뺐다(라벨은 그대로). 조건판에서 조건을 조여 주세요">
                                조건이 너무 넓습니다 — {cellSet.matched.toLocaleString("ko-KR")}건 이상
                            </span>
                        )}
                        {cellSet.truncated && !cellSet.tooWide && (
                            <span className="tabular" style={{ flexShrink: 0, fontSize: 10.5, color: "var(--fall)" }}
                                title="상한을 넘어 **종목 경계에서** 잘렸다 — 남은 종목의 수는 정확하다. 조건을 조이면 전부 보인다">
                                상한 {cellSet.limit.toLocaleString("ko-KR")} 초과 — 잘림
                            </span>
                        )}
                        {deficientCount > 0 && (
                            <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }}
                                title="이 우주에서 평가할 수 없는 조건이 있습니다 — 그 칸은 세지 않습니다(조건판에서 이유를 봅니다)">
                                결손 칸 {deficientCount}
                            </span>
                        )}
                        {(crossing.seeking || crossing.note) && (
                            <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                                {crossing.seeking ? `날짜 넘기는 중…${crossing.skipped > 0 ? ` (${crossing.skipped}일 건너뜀)` : ""}` : crossing.note}
                            </span>
                        )}
                    </>
                ) : (
                    <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                        {shownCount} 표시{hasActiveDnf(dnf) || narrowOn ? ` · ${hiddenCount} 숨김` : ""}
                    </span>
                )}
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

            {listRows.length === 0 ? (
                <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>
                    {/* ⚠ **빈 이유를 조건 탓으로 돌리지 않는다** — 장이 안 선 날(주말·휴장)은 조건을
                        아무리 넓혀도 0이다. 그 사실을 먼저 말한다(2026-09-20: 시선 날짜가 오늘로
                        시작하던 탓에 주말에 켜면 전부 이 화면이었고, 문구가 조건 탓을 했다). */}
                    {hasData === false
                        ? `${focusDate} 은 데이터가 없는 날입니다(휴장·미수집) — w/s 로 거래일로 넘기세요`
                        : isDaily
                        ? (cellSet.tooWide
                            // 머리글이 "너무 넓습니다"를 이미 말한다 — 같은 문장을 두 번 쓰지 않는다.
                            ? "조건 층을 뺐습니다(위 안내) — 이 날엔 라벨 좌표도 없습니다"
                            : "이 날에 걸린 좌표가 없습니다 — 조건판에서 조건을 넓히거나 w/s 로 날짜를 넘기세요")
                        : hiddenCount > 0 ? `표시할 항목 없음 — 필터·좁히기로 ${hiddenCount}건 숨김` : "이 시선에 항목 없음"}
                </div>
            ) : (
                <WorksetList
                    rows={listRows}
                    focus={{ code: focusCode, date: focusDate, time: focusTime }}
                    lens={lens}
                    nameOf={nameOf}
                    // 타점 행 아이콘의 낟알 = **좌표 라벨**(직접 소속만 — 표시 규칙은 day 쪽과 대칭).
                    // 하루 그룹은 종목 행 배지가 말한다(붙는 머리라 스크롤 중에도 남는다).
                    pointGroupsOf={pointGroupsOf}
                    pathOf={(id) => pathLabel(id, "(지워짐)")}
                    // goToDay — 하루를 고르는 손짓이라 시각을 **명시적으로 푼다**(time: null).
                    // 안 그러면 옛 시각이 남아 그 차트의 라벨 좌표를 우연히 가리키는 순간 하루 선택이 아니게 된다.
                    onPickDay={(e) => goToDay({ date: e.date, code: e.code })}
                    onPickPoint={(p) => goToPoint({ date: p.date, code: p.stockCode, time: p.time })}
                    onPickCell={(code, date, time) => goToPoint({ date, code, time })}
                    onToggleCollapse={toggleCollapse}
                    jumpTo={jump.code ? jump : undefined}
                />
            )}
        </div>
    );
}
