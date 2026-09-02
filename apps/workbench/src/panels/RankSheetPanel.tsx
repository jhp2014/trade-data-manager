import { useEffect, useMemo, useRef, useState } from "react";
import { usePointRows } from "../lib/usePointRows.js";
import { useAutoPoints } from "../lib/PointGridsContext.js";
import { useCandidateDays } from "../lib/useCandidateDays.js";
import { usePresenceIndex } from "../lib/usePresence.js";
import { buildDaySheetRows, buildSheetRows, type SheetRow } from "./rank/rankSheet.js";
import { useSheetColumns } from "./rank/useSheetColumns.js";
import {
    DEFAULT_CHAIN, buildSheetGroups, dropSort, parseSortChain, pushSort, resetSort, resolveCutKeys,
    sortSheetRows, type SortChain, type SortCtx, type SortKey,
} from "./rank/sheetSort.js";
import { buildAxisIndex, orderKeyByPoint, type AxisIndex } from "../lib/rankIndex.js";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GROUP_H, ROW_H, SheetRowView, type SheetRowHandlers } from "./rank/SheetRowView.js";
import { flatIndexOfRow, flattenSheetGroups } from "./rank/sheetFlatRows.js";
import { SheetHeaderRow } from "./rank/SheetHeaderRow.js";
import { SheetMenusHost, useSheetMenus } from "./rank/SheetMenusHost.js";
import { useSessionScroll } from "./rank/useSessionScroll.js";
import { useRankAxes } from "../lib/RankAxesContext.js";
import { valueDomain, valueToFrac } from "../lib/computedAxis.js";
import { useLinkedSet } from "./filter/useSetBinding.js";
import { SetBindingLabel } from "./filter/SetBindingLabel.js";
import { setMembersOf } from "./filter/setMembers.js";
import { parseCellMode, CELL_MODE_LABEL, type CellMode, type ValuedCell } from "./rank/sheetCell.js";
import { PanelHeader, ScrollRow, miniBtn, mutedNote } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { chartKey, pointKey, rowKey, rowLookup } from "../lib/pointKey.js";
import { subjectStatus, useSubject } from "../lib/subject.js";
import { useStockNames } from "../lib/useStockNames.js";
import { SubjectBadge } from "../components/SubjectBadge.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import type { ReviewPointKey } from "@trade-data-manager/market/domain";

// 타점 분석 시트 — 행=타점(격자 파생) · 열=축별 순위. (축은 전부 계산 축 — 판단축은 2026-08-25 폐지.)
//  · 셀 = 숫자 / 순위 눈금 / 값 눈금(토글). 숫자엔 값이 먼저 오고(`+12.3% (3/12)`), 값 눈금은
//    **필터 보드 레일과 같은 좌표**라 쏠림이 보인다. 값 없음(결손·입력 전) = 빈칸.
//  · 헤더 클릭 = 그 열로 정렬(축은 강 먼저) · **Shift+클릭 = 정렬 단 추가**(n차). 정렬 축에서 행범위
//    체인·그룹 규칙은 sheetSort(순수·테스트)에. 필터(밴드·값구간)는 필터 패널로 이사 — 시트는 결과를 구독만.
//  · **행 묶기**: 1차 키에서만 접는다. 날짜처럼 값이 몇 가지뿐인 열은 저절로, 축처럼 값이 거의
//    유일한 열은 셀 우클릭 **그룹 나누기(컷)** 를 그었을 때만. 컷은 "한 구간만 남기는" 밴드와 달리 아무것도
//    안 버리고 N개로 나눈다 → 구간끼리 한 화면에서 비교된다(밴드는 분석 모수까지 좁힌다는 게 다른 점).
//  · 필터 활성 시 행=보는 집합(좁히기) 또는 전체+흐리게. **깔때기를 직접 구독**한다(어댑터 없음).
//  · 축은 코드가 정의한다(파일 하나 + 레지스트리 한 줄) — 만들기·이름 변경·배치가 화면에 없다.
//  · **비고정** 축 열의 드래그 재정렬은 store rankAxisOrder 를 만진다(시트 전용 순서 — 집합 편성 보드는 제 것을 따로 든다).
//    고정한 열은 시트 전용 자리 — 고정 그룹 안에서만 순서를 바꾼다(순서 소스가 둘이라 규칙을 갈랐다).
//  · 열 폭은 손으로 조절 가능(헤더 오른쪽 가장자리 드래그). **수동 폭과 계산 축이 고정폭**이고, 나머지 축 열이
//    남는 폭을 나눠 갖는다 → "폭 원위치"(수동 폭 삭제)면 기본 동작으로 정확히 복귀한다.
//  · **그룹(태그)은 시트에 없다** — 좁은 셀에 넣으면 이름이 잘려 색만 남고, 그 색을 읽으려면 결국 다른 패널을
//    봐야 한다. 그룹은 조상 경로까지 보여야 뜻이 서므로 폭이 있는 자리(필터 보드·팔레트·타점 정보)의 일이다.
//
// 구성(분해): 열 구성=useSheetColumns · 헤더 줄=SheetHeaderRow ·
// 팝업 세 벌=SheetMenusHost · 세션 스크롤=useSessionScroll. 본체는 **데이터 파생과 조립**만 한다.

const POS_MODE_KEY = "wb.rankSheetPosMode";
const ROWMODE_KEY = "wb.rankSheetRowMode";
type RowMode = "point" | "day";
const parseRowMode = (o: unknown): RowMode | null => (o === "day" ? "day" : o === "point" ? "point" : null);
const FILTERMODE_KEY = "wb.rankSheetFilterMode";
const SORT_KEY = "wb.rankSheetSort"; // 정렬 체인 영속(다른 시트 설정과 동일 패턴) — 프리셋 전환·새로고침에 유지. 옛 단일 정렬도 읽는다.
// 무필터 상태의 매칭 집합 — 참조 하나로 고정해 useMemo 결과가 렌더마다 안 바뀌게(깔때기 쪽 상수 패턴과 동일).
const EMPTY_KEYS: ReadonlySet<string> = new Set();

export function RankSheetPanel(): JSX.Element {
    // 행 모드 — 타점(분석의 기본) / 하루(후보 하루 × day 축). day 는 열·정렬의 저장 주머니가 달라
    // **모드째 리마운트**한다(usePersistedState 가 키 변경을 안 따라가므로 — 옛 상태가 새 키를 덮는 사고 방지).
    const [rowMode, setRowMode] = usePersistedState<RowMode>(ROWMODE_KEY, parseRowMode, "point");
    return <SheetBody key={rowMode} rowMode={rowMode} setRowMode={setRowMode} />;
}

function SheetBody({ rowMode, setRowMode }: { rowMode: RowMode; setRowMode: (m: RowMode) => void }): JSX.Element {
    const dayMode = rowMode === "day";
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const goToDay = useWorkbench((s) => s.goToDay);
    // 지금 선택(subject) — 타점 또는 하루. 행 강조·스크롤 따라가기·머리글 배지가 이걸 본다.
    const subject = useSubject();
    const isSubjectRow = (r: { stockCode: string; date: string; time?: string }): boolean =>
        subject !== null && r.stockCode === subject.code && r.date === subject.date &&
        (r.time === undefined || subject.time === null || r.time === subject.time);

    // 호버는 React 상태가 아니라 CSS :hover 다(.sheet-row, theme.css) — 행 배경·핀 손잡이 노출이
    // 전부라, 상태로 들면 행 하나 스칠 때마다 패널이 두 번씩 리렌더된다(2026-08-20 검수).
    // 핀(작업셋)·축 순서는 여전히 공유 상태 — 다른 화면(작업 대상·필터 보드 레일)이 같은 걸 본다.
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    // ── 축 + 라인(필터 보드 레일과 공유) → 순위 인덱스. 열 재정렬도 같은 store 순서를 만진다.
    const { axes: allAxes, linesByAxis, computedValues, computedMeta, isLoading: axesLoading, reorder: reorderAxis } = useRankAxes();
    // day 모드의 열은 day 축만 — point 축은 행(하루)에 값을 정의할 수 없다(시각이 값에 들어간다).
    const axes = useMemo(() => (dayMode ? allAxes.filter((a) => a.scope === "day") : allAxes), [allAxes, dayMode]);
    const axisIds = useMemo(() => axes.map((a) => a.key), [axes]);
    const indexByAxis = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        for (const [axisId, placed] of linesByAxis) m.set(axisId, buildAxisIndex(placed));
        return m;
    }, [linesByAxis]);

    // ── 셀 표시 모드(숫자 / 순위 눈금 / 값 눈금). 규칙·옛 저장본 이관은 sheetCell(순수·테스트)에.
    const [cellMode, setCellMode] = usePersistedState<CellMode>(POS_MODE_KEY, parseCellMode, "rank");

    // 컨테이너 폭 관측 — 남는 폭을 축 열들이 나눠 넓힘(각자 최소폭 유지). 위치바 모드는 최소폭 ↑.
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [containerW, setContainerW] = useState(0);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => setContainerW(es[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const axisMin = cellMode === "number" ? 56 : 76; // 눈금 모드는 그릴 폭이 필요하다

    // ── 열 구성(고정·숨김·폭·컷 + 되짚기) — 넷 다 축 키를 들어 청소 규칙이 같으므로 한 훅이 소유한다.
    // 유령 키 청소 기준은 전체 축 — day 모드의 좁힌 목록으로 프룬하면 공유 컷의 point 축 키가 지워진다.
    const pruneAxisIds = useMemo(() => allAxes.map((a) => a.key), [allAxes]);
    const cols = useSheetColumns({ axes, axesLoading, containerW, axisMin, rowMode, pruneAxisIds });
    const { displayCols, leftOf, tableW, lastFrozenKey, widthOf } = cols;

    // ── 전체 타점(행 원천) + 기간. day 모드는 후보 하루(존재 지도 파생)가 행 원천이다.
    const { points: allPoints, isLoading: pointsLoading } = usePointRows(); // point 행 원천(자동 타점 파생)
    const { candidates, isLoading: candLoading } = useCandidateDays();
    const autoPoints = useAutoPoints(); // day 행의 "타점 수" — 존재 지도가 아니라 파생 한 벌에서 센다
    const { index: presenceIdx } = usePresenceIndex();
    const allByKey = useMemo(() => {
        const m = new Map<string, ReviewPointKey>();
        for (const p of allPoints) m.set(pointKey(p), p);
        return m;
    }, [allPoints]);

    // ── 보는 집합 — 연동 하나(전역 선택 포인터 + 월 시선 구독, 주인은 작업셋). 사이드바 재편(2026-08-21)으로
    //    패널별 고정 바인딩·집합 사이드바는 폐지 — 멤버 브라우징·표현 안 됨은 작업셋이 담당한다.
    const linked = useLinkedSet();
    const bandsActive = linked.view.isFiltering;
    // 무필터면 매칭이라는 개념 자체가 없다 — 전 우주 Set 을 짓지 않는다(수천 타점이면 그게 그대로 비용).
    const interKeys = useMemo<ReadonlySet<string>>(() => {
        if (!linked.view.isFiltering) return EMPTY_KEYS;
        // day 모드의 매칭 단위는 하루(차트 키) — 뷰가 이미 들고 있다. point 모드는 타점 키.
        return dayMode ? linked.view.viewedChartKeys : new Set(linked.view.viewedPointRefs.map(pointKey));
    }, [dayMode, linked.view.isFiltering, linked.view.viewedChartKeys, linked.view.viewedPointRefs]);
    const matchKeyOf = (r: { stockCode: string; date: string; time?: string }): string =>
        dayMode ? chartKey(r) : pointKey({ stockCode: r.stockCode, date: r.date, time: r.time ?? "" });
    // 표현가능 술어 — 시트의 행이 될 수 있나. point 모드 = 타점 사전에 있나(타점 0인 하루는 전개가 못 살린다).
    // day 모드 = 후보 하루인가(존재 지도에 있나).
    const candSet = useMemo(() => new Set(candidates.map(chartKey)), [candidates]);
    const setMembers = useMemo(
        () => (dayMode
            ? setMembersOf(linked.view, "day", (it) => candSet.has(chartKey(it)))
            : setMembersOf(linked.view, "point", (it) => it.time !== undefined && allByKey.has(pointKey({ stockCode: it.stockCode, date: it.date, time: it.time })))),
        [dayMode, linked.view, allByKey, candSet],
    );

    // 필터 표시 모드 — narrow(교집합만) / dim(전체 유지, 밴드 밖 흐리게). 영속.
    const [filterMode, setFilterMode] = usePersistedState<"narrow" | "dim">(FILTERMODE_KEY, (o) => (o === "dim" ? "dim" : o === "narrow" ? "narrow" : null), "narrow");

    // 행 집합: narrow + 필터 활성 → 매칭 집합만. dim 또는 무필터 → 전체(밴드 밖은 렌더에서 흐리게).
    const rowPoints = useMemo<readonly ReviewPointKey[]>(() => {
        if (dayMode) return [];
        if (bandsActive && filterMode === "narrow") {
            const out: ReviewPointKey[] = [];
            for (const k of interKeys) { const it = allByKey.get(k); if (it) out.push(it); }
            return out;
        }
        return allPoints;
    }, [dayMode, bandsActive, filterMode, interKeys, allByKey, allPoints]);

    const rows = useMemo(() => {
        if (!dayMode) return buildSheetRows(rowPoints, axisIds, indexByAxis);
        // day 행 = 후보 하루 전부(빈 셀 = 진도 정보). narrow 필터는 차트 키로 좁힌다.
        const base = bandsActive && filterMode === "narrow" ? candidates.filter((c) => interKeys.has(chartKey(c))) : candidates;
        return buildDaySheetRows(base, axisIds, indexByAxis, (c) => presenceIdx.get(chartKey(c)), (c) => autoPoints.byChart.get(chartKey(c))?.length ?? 0);
    }, [dayMode, rowPoints, axisIds, indexByAxis, bandsActive, filterMode, candidates, interKeys, presenceIdx, autoPoints]);

    // ── 정렬 체인(n차). 평클릭=리셋 · Shift+클릭=단 추가. 규칙 전부는 sheetSort(순수·테스트) 에.
    //    축 정렬 = 강(rank↑) 먼저, 값 없음(미배치·미산정)은 방향 무관 바닥. localStorage 영속(옛 단일 정렬도 읽는다).
    const [sort, setSort] = usePersistedState<SortChain>(dayMode ? `${SORT_KEY}.day` : SORT_KEY, parseSortChain, DEFAULT_CHAIN);
    const primary = sort[0];
    // 종목명 — 사전 한 벌(전량)에서. 타점 피드에 실려 오는 이름은 안 읽는다: 같은 마스터에서 나온
    // 부분집합이라 더 알려주는 게 없고, 출처가 둘이면 어느 쪽이 맞는지의 문제가 생긴다.
    const { nameOf } = useStockNames();

    // ── 그룹 컷 — 저장·청소는 열 구성 훅이(축 키를 든 다른 설정들과 같은 사정), 여기서는 **읽어 쓰기만**.
    const sortAxisId = primary.key.kind === "axis" ? primary.key.axisId : null;
    const orderKeyOfSort = useMemo(() => (sortAxisId ? orderKeyByPoint(linesByAxis.get(sortAxisId) ?? []) : undefined), [sortAxisId, linesByAxis]);
    const cutKeys = useMemo(
        () => (sortAxisId ? resolveCutKeys(cols.cuts[`ax:${sortAxisId}`] ?? [], orderKeyOfSort) : []),
        [sortAxisId, cols.cuts, orderKeyOfSort],
    );

    const sortCtx = useMemo<SortCtx>(() => ({ nameOf }), [nameOf]);
    const sorted = useMemo(() => sortSheetRows(rows, sort, sortCtx, cutKeys), [rows, sort, sortCtx, cutKeys]);
    const groups = useMemo(() => buildSheetGroups(sorted, sort, sortCtx, cutKeys), [sorted, sort, sortCtx, cutKeys]);

    // 상단 고정 블록 = **핀만**. 활성 타점의 상시 고정은 폐기했다(사용자 확정) — 목록에 없는 선택을
    // 억지로 상단에 세우는 대신, 행이 있으면 스크롤로 따라가고 없으면 머리글 배지가 이유를 말한다.
    const pinnedRows = useMemo(() => {
        if (dayMode) return []; // 핀(작업 대상)은 타점의 개념 — day 행엔 핀 손잡이도 없다
        const items = pinned.map((k) => allByKey.get(k)).filter((x): x is ReviewPointKey => !!x);
        return buildSheetRows(items, axisIds, indexByAxis);
    }, [dayMode, pinned, allByKey, axisIds, indexByAxis]);
    const mainRows = sorted; // 핀 행도 기존 위치에 그대로(상단 고정 블록에 중복 표시, 삼각형으로 구분)

    // ── 가상화 — 그룹 머리와 행을 한 배열로 편 뒤(sheetFlatRows) **보이는 줄만** 그린다.
    //  · day 모드 모수가 후보 하루 전부(수천)라 전 행을 그리면 크롬이 얼어붙는다. 모수를 좁히는 건 답이
    //    아니다 — "값 없는 날 = 아직 안 한 날"을 한 화면에서 보는 게 이 모드의 존재 이유다.
    //  · 높이는 **측정하지 않는다**(estimateSize 가 상수를 돌려주고 measureElement 를 안 단다) —
    //    행·머리 둘 다 border-box 고정 높이라 산술이 정확하다.
    const flat = useMemo(() => flattenSheetGroups(groups), [groups]);
    // 머리 블록 높이 = 헤더 줄 + 핀 행들. **측정이 아니라 이 값이 레이아웃을 정한다**(머리 블록의 height 도
    // 이걸 쓴다) — 그래서 관측자가 하나도 안 늘어난다. day 모드는 핀이 없어 늘 ROW_H.
    const headH = ROW_H * (1 + pinnedRows.length);
    const virt = useVirtualizer({
        count: flat.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (i) => (flat[i]?.kind === "group" ? GROUP_H : ROW_H),
        getItemKey: (i) => flat[i]?.key ?? i,
        overscan: 8,
        // 스크롤 상자 안에서 가상 목록이 시작하는 지점(머리 블록 아래). 헤더를 상자 **밖**으로 빼면
        // 가로 스크롤이 갈려 고정 열이 죽으므로, 빼는 대신 이 보정을 준다.
        scrollMargin: headH,
        // 따라가기(scrollToIndex)가 행을 머리 블록 **밑에** 숨기지 않게.
        // align:"center" 와 함께 쓰면 행이 가시영역 정중앙에서 headH/2 만큼 **아래**로 앉는다
        // (virtual-core 가 center 보정을 scrollPaddingStart 를 뺀 뒤에 얹는다). 빼는 쪽이 나쁘다 —
        // 그러면 같은 크기만큼 머리 블록 **쪽으로** 치우친다. 지금 방향이 안전한 쪽이라 그대로 둔다.
        scrollPaddingStart: headH,
    });

    // 선택의 정의역 판정 — 시트의 재료는 타점이다. 하루 선택이면 그날 타점 아무거나(subject.ts 규칙).
    const subjectRowKey = useMemo(() => {
        const r = mainRows.find(isSubjectRow);
        return r ? rowKey(r) : null;
    }, [mainRows, subject]);
    const subjectInData = useMemo(
        () => subject !== null && (dayMode
            ? candidates.some((c) => c.stockCode === subject.code && c.date === subject.date)
            : allPoints.some(isSubjectRow)),
        [dayMode, candidates, allPoints, subject],
    );
    const status = subjectStatus(subjectInData, subjectRowKey !== null);

    // 선택 따라가기 — 행이 있으면 그 자리로 스크롤(사용자 확정: 고정 대신 스크롤).
    //  · 내가(rank-sheet) 바꾼 선택엔 안 움직인다 — 행을 눌렀는데 화면이 튀면 클릭이 벌이 된다.
    //  · 마운트 첫 판정도 건너뛴다 — 세션 스크롤 복원(useSessionScroll)과 싸우지 않게.
    //  · 가상 목록이라 ref+scrollIntoView 가 아니라 **가상화기 API**로 간다(화면 밖 행엔 DOM 이 없다).
    //    flat 은 ref 로 읽는다 — deps 에 넣으면 정렬·필터가 바뀔 때마다 도는데, 이 effect 의 트리거는
    //    어디까지나 "선택이 바뀌었나" 하나여야 한다.
    const flatRef = useRef(flat);
    flatRef.current = flat;
    const followedRef = useRef<string | null>(null);
    useEffect(() => {
        if (followedRef.current === null) { followedRef.current = subjectRowKey ?? ""; return; }
        if (subjectRowKey === null || subjectRowKey === followedRef.current) { followedRef.current = subjectRowKey ?? ""; return; }
        followedRef.current = subjectRowKey;
        if (useWorkbench.getState().lastFocusOrigin === "rank-sheet") return;
        const i = flatIndexOfRow(flatRef.current, subjectRowKey);
        if (i >= 0) virt.scrollToIndex(i, { align: "center" });
    }, [subjectRowKey, virt]);

    const clickHeader = (key: SortKey, shift: boolean): void => setSort((s) => (shift ? pushSort(s, key) : resetSort(s, key)));
    const unplacedOnSort = sortAxisId ? mainRows.filter((row) => !row.cells[sortAxisId]).length : 0;

    /**
     * 축이 이 타점에 대해 아는 값 — 값의 자리(레일과 같은 좌표)와 표기.
     */
    const valueViews = useMemo(() => {
        const m = new Map<string, { values: Map<string, number>; domain: { min: number; max: number }; strongerWhen: "higher" | "lower"; scale?: "log"; fmt: (v: number) => string }>();
        for (const [axisId, values] of computedValues) {
            const domain = valueDomain(values);
            const meta = computedMeta.get(axisId);
            if (domain && meta) m.set(axisId, { values, domain, strongerWhen: meta.strongerWhen, scale: meta.scale, fmt: meta.fmt });
        }
        return m;
    }, [computedValues, computedMeta]);
    // 참조 고정 — SheetRowView(memo)가 얕은 비교로 재사용하도록.
    const valuedOf = useMemo(() => (axisId: string, row: SheetRow): ValuedCell | undefined => {
        const view = valueViews.get(axisId);
        const v = view ? rowLookup(view.values, row) : undefined; // day 축 값은 차트 행 — 폴백
        return view && v !== undefined ? { frac: valueToFrac(v, view.domain, view.strongerWhen, view.scale), text: view.fmt(v) } : undefined;
    }, [valueViews]);

    // 스크롤 위치 세션 복원 — 줄이 실제로 그려진 뒤 1회. onScroll 로 저장(useSessionScroll).
    //  · day 모드의 후보 하루(candLoading)까지 기다린다 — 이게 빠져 있으면 dataReady 가 조기 반환 중에
    //    true 로 튀어 scrollRef 가 null 인 채 지나가고, deps 가 다시 안 바뀌어 **복원이 영영 안 일어난다**.
    //  · 세로 복원은 **가상화기 API**로 — DOM 에 직접 scrollTop 을 쓰면 가상화기가 그 사실을 못 배워
    //    스크롤바와 그리는 구간이 어긋난다. 가로는 가상화기에 축이 없어 DOM 이 맡는다.
    //  · flat.length 조건 때문에 **필터가 0행으로 좁힌 채 마운트되면 복원이 그 순간 안 일어나고,
    //    나중에 행이 생길 때 일어난다.** 그게 맞다 — 빈 목록은 총 높이가 0이라 복원해도 0으로 clamp 돼
    //    사라질 뿐이고, 0행 상태에선 사용자가 스크롤로 덮어쓸 것도 없다(스크롤될 내용이 없다).
    const dataReady = !axesLoading && !pointsLoading && !(dayMode && candLoading) && axes.length > 0 && flat.length > 0;
    const scroll = useSessionScroll(scrollRef, dataReady, (top) => virt.scrollToOffset(top));

    // ── 팝업 상태(셀 우클릭 · 열 이름 우클릭) — opener 만 행·헤더·컨트롤에 나눠 꽂는다.
    const menus = useSheetMenus();

    const navRow = (row: SheetRow): void => {
        if (row.time === undefined) goToDay({ date: row.date, code: row.stockCode }, "rank-sheet");
        else goToPoint({ date: row.date, code: row.stockCode, time: row.time }, "rank-sheet");
    };

    // 행 핸들러 묶음 — SheetRowView(memo)가 얕은 비교로 재사용하도록 **참조를 고정**한다(useRef 경유,
    // 내용물은 매 렌더 최신 클로저로 갱신 — useChartHotkeys 의 h.current 패턴과 같은 이유).
    const rowHandlersRef = useRef<SheetRowHandlers>({} as SheetRowHandlers);
    rowHandlersRef.current.onNav = navRow;
    rowHandlersRef.current.onTogglePin = togglePin;
    rowHandlersRef.current.onCellCtx = menus.openCellCtx;
    const rowH = rowHandlersRef.current;

    // 한 행 렌더 — 상태 파생(포커스·핀·흐림)만 여기서 계산하고 렌더는 SheetRowView(memo). 호버는 CSS.
    // top 이 있으면 가상 목록의 그 자리에 앉는다(없으면 흐름 배치 = 머리 블록의 핀 행).
    // **스칼라로 넘긴다** — 자리 스타일 객체를 만들어 넘기면 매 렌더 새 참조라 memo 가 조용히 죽는다.
    const renderRow = (row: SheetRow, isLastPinned = false, inPinnedBlock = false, top?: number): JSX.Element => {
        const key = rowKey(row);
        const isPinned = pinnedSet.has(key);
        return (
            <SheetRowView key={key} row={row} cols={displayCols}
                leftOf={leftOf} lastFrozenKey={lastFrozenKey} widthOf={widthOf}
                name={nameOf(row.stockCode)}
                mode={cellMode} valuedOf={valuedOf} sortAxisId={sortAxisId}
                focus={isSubjectRow(row)} pinned={isPinned}
                dim={bandsActive && !interKeys.has(matchKeyOf(row)) && (isPinned || filterMode === "dim")}
                inPinnedBlock={inPinnedBlock} isLastPinned={isLastPinned} top={top} h={rowH} />
        );
    };

    // 헤더 컨트롤 선언 — 눈금·필터모드·축 만들기. 아래 "⤺" 해제 손잡이들은 여기 안 든다:
    // 걸린 게 있을 때만 뜻이 생기는 **문맥 손잡이**라 성격이 다르다(개수가 곧 정보다).
    // **폭 원위치만 예외로 여기 든다** — 그것 하나는 실을 개수가 없다(정렬 2단·그룹 3·숨긴 열 2 와 달리
    // "몇 개인지"를 말하지 않는 순수 액션이다). 개수가 정보가 아니면 나타났다 사라질 이유도 없고,
    // 그러면 늘 같은 자리에 서서 할 게 없을 땐 흐려지는 컨트롤 줄의 규약이 더 맞다.
    const controls: ControlSpec[] = [
        {
            kind: "choice", id: "rowMode", name: "행",
            help: "행의 단위 — 타점(분봉 시각까지) / 하루(후보 하루 × day 축, 타점 없이도 값이 선다)",
            values: [{ v: "point", label: "타점" }, { v: "day", label: "하루" }],
            value: rowMode, set: (v) => setRowMode(parseRowMode(v) ?? "point"),
        },
        {
            kind: "choice", id: "cellMode", name: "눈금", help: "칸을 무엇으로 읽을까 — 값 눈금은 계산 축에서만 다르다(판단 축은 순위로 폴백)",
            values: [
                { v: "number", label: CELL_MODE_LABEL.number },
                { v: "rank", label: CELL_MODE_LABEL.rank },
                { v: "value", label: CELL_MODE_LABEL.value },
            ],
            value: cellMode, set: (v) => setCellMode(parseCellMode(v) ?? "number"),
        },
        {
            kind: "choice", id: "filterMode", name: "필터 방식", available: bandsActive,
            help: "매칭만 남길까, 전체를 두고 밖을 흐리게 할까",
            values: [{ v: "narrow", label: "좁히기" }, { v: "dim", label: "흐리게" }],
            value: filterMode, set: (v) => setFilterMode(v === "dim" ? "dim" : "narrow"),
        },
        {
            kind: "action", id: "resetWidths", name: "폭 원위치", label: "원위치", group: "열",
            help: "손으로 조절한 열 폭 전부 해제(기본 폭·축 잔여 분배로 복귀)",
            disabled: !cols.hasManualWidths,
            run: cols.resetWidths,
        },
    ];

    if (axesLoading || pointsLoading || (dayMode && candLoading)) return <Wrap><div style={muted}>불러오는 중…</div></Wrap>;
    if (axes.length === 0) return <Wrap><div style={muted}>계산 축이 없습니다 — 서버 축 레지스트리가 비어 있습니다.</div></Wrap>;

    return (
        <Wrap>
            {/* 머리글 — 왼쪽은 말(바인딩 라벨·행수·선택 배지·"⤺" 해제들), 오른쪽은 손(HeaderControls).
                "⤺" 들이 왼쪽에 남는 건 걸린 게 있을 때만 뜻이 생기는 **문맥 손잡이**라서다 — 개수가 곧 정보고,
                컨트롤처럼 늘 서 있는 것이 아니다. 바인딩 라벨이 칩(버튼)에서 못 누르는 말로 내려온 것도
                그 잣대다: 늘 서 있는 손잡이였으니 사라지는 것들 틈이 아니라 컨트롤 줄이 제자리다.
                같은 잣대로 "폭 원위치"도 컨트롤 줄로 갔다 — 셋과 달리 실을 개수가 없었다(controls 선언 참고). */}
            <PanelHeader gap={8}>
                <ScrollRow gap={9}>
                    <SetBindingLabel linked={linked} members={setMembers} />
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>{mainRows.length}행{bandsActive ? ` · 매칭 ${interKeys.size}` : ""}{sortAxisId && unplacedOnSort > 0 ? ` · 값 없음 ${unplacedOnSort}` : ""}</span>
                    {/* 선택이 이 표에 없을 때만 그 이유를 말한다 — 필터 밖(좁히기로 빠짐)과 타점 없음(하루 선택 등)은 다른 문제다. */}
                    <SubjectBadge subject={subject} status={status} name={subject ? nameOf(subject.code) : undefined} absentLabel="타점 없음" />
                    {sort.length > 1 && <button onClick={() => setSort((s) => [s[0]])} title="2차 이하 정렬 해제(1차만 남김)" style={{ ...miniBtn, flexShrink: 0 }}>정렬 {sort.length}단 ⤺</button>}
                    {cutKeys.length > 0 && <button onClick={() => cols.clearCuts(sortAxisId!)} title="이 축의 그룹 컷 모두 해제" style={{ ...miniBtn, flexShrink: 0 }}>그룹 {cutKeys.length + 1} ⤺</button>}
                    {cols.hiddenCols.length > 0 && <button onClick={cols.showAllHidden} title="숨긴 열 모두 보이기" style={{ ...miniBtn, flexShrink: 0 }}>숨긴 열 {cols.hiddenCols.length} ⤺</button>}
                </ScrollRow>
                <HeaderControls controls={controls} storageKey="wb.headerPins.rankSheet" />
            </PanelHeader>

            {/* 표가 아니라 **div 그리드**다 — 폭·고정 오프셋은 전부 layoutColumns 가 이미 계산해 두므로
                <table> 은 그 숫자를 받아 쓰기만 하는 껍데기였고, <tr> 이 절대배치를 못 받아 가상화 좌표계가
                둘로 갈렸다(.claude/decisions.md "워크벤치 목록 렌더링").
                ⚠ 이 안의 어떤 상자에도 overflow 를 걸지 말 것 — 걸리는 순간 그게 새 스크롤 기준이 돼
                  좌측 고정 열의 sticky 가 조용히 죽는다. 말줄임은 셀 자신의 overflow 로 한다. */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <div ref={scrollRef} onScroll={scroll.onScroll} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", fontSize: 12 }}>
                {/* 머리 블록 = 열 헤더 + 핀 행(둘 다 상단 sticky, 틈·비침 없이 하나로). 높이(headH)는
                    측정하지 않고 **이 값이 정한다** — 같은 값이 가상화기의 scrollMargin 으로 간다.
                    헤더를 스크롤 상자 **밖**으로 빼면 안 된다 — 가로 스크롤이 갈려 고정 열이 죽는다. */}
                <div style={{ position: "sticky", top: 0, zIndex: 5, width: tableW, height: headH, boxSizing: "border-box", background: "var(--bg-secondary)" }}>
                    <SheetHeaderRow displayCols={displayCols} cols={cols} sort={sort}
                        reorderAxis={reorderAxis}
                        onSort={clickHeader} onHeaderCtx={menus.openHdrCtx} />
                    {pinnedRows.map((row, j) => renderRow(row, j === pinnedRows.length - 1, true))}
                </div>
                {/* 본문 상자 = 가상 목록의 총 높이 상자. z-index 를 주지 않는다(주면 sticky 머리 블록이 행 밑으로 깔린다). */}
                <div style={{ width: tableW, height: virt.getTotalSize(), position: "relative" }}>
                    {/* 보이는 줄만. 그룹 머리는 1차 키에서만 선다(이산 열은 저절로, 축은 사람이 그은 컷) —
                        평탄화(sheetFlatRows)가 그 규칙을 이미 적용해 둔 배열이라 여기선 kind 만 갈라 그린다. */}
                    {virt.getVirtualItems().map((v) => {
                        const f = flat[v.index];
                        if (!f) return null;
                        // v.start 에는 scrollMargin 이 더해져 있다 — 상자 안 좌표로 되돌린다.
                        // 빼먹으면 전 줄이 머리 블록 높이만큼 밀리고 꼬리에 빈 공간이 남는다(원인 짚기 고약한 증상).
                        const top = v.start - headH;
                        if (f.kind === "group") return (
                            <div key={f.key} style={{ position: "absolute", top, left: 0, display: "flex", alignItems: "center", width: tableW, height: GROUP_H, boxSizing: "border-box", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", background: "var(--bg-secondary)", borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-default)" }}>
                                <span style={{ position: "sticky", left: 0, padding: "0 10px", whiteSpace: "nowrap" }}>
                                    {f.label}<span style={{ fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 6 }}>· {f.count}행</span>
                                </span>
                            </div>
                        );
                        return renderRow(f.row, false, false, top);
                    })}
                </div>
                {/* 고정 블록(핀)은 조건에 맞아서 있는 게 아니다 — 그게 차 있어도 "맞는 게 없다"는 사실은 말해야 한다. */}
                {mainRows.length === 0 && <div style={muted}>{bandsActive ? `이 조건에 맞는 ${dayMode ? "하루가" : "타점이"} 없습니다.` : dayMode ? "후보 하루가 없습니다." : "이 기간에 타점이 없습니다."}</div>}
            </div>
            </div>

          <SheetMenusHost m={menus} axes={axes} cols={cols} sortAxisId={sortAxisId} sortLen={sort.length}
              dropSortKey={(k) => setSort((s) => dropSort(s, k))} />
        </Wrap>
    );
}

const Wrap = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>{children}</div>
);
const muted = mutedNote;
