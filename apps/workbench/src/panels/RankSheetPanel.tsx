import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DndContext } from "@dnd-kit/core";
import { allPointsQuery } from "../api/queries.js";
import { buildSheetRows, type SheetRow } from "./rank/rankSheet.js";
import { colKey } from "./rank/sheetColumns.js";
import { useSheetColumns } from "./rank/useSheetColumns.js";
import {
    DEFAULT_CHAIN, buildSheetGroups, cutsActive, dropSort, parseSortChain, pushSort, resetSort, resolveCutKeys,
    sortSheetRows, type SortChain, type SortCtx, type SortKey,
} from "./rank/sheetSort.js";
import { buildAxisIndex, orderKeyByPoint, type AxisIndex } from "../lib/rankIndex.js";
import { SheetRowView, type SheetRowHandlers } from "./rank/SheetRowView.js";
import { SheetHeaderRow } from "./rank/SheetHeaderRow.js";
import { SheetMenusHost, useSheetMenus } from "./rank/SheetMenusHost.js";
import { useAxisAdmin } from "./rank/useAxisAdmin.js";
import { useSheetDragPlacement } from "./rank/useSheetDragPlacement.js";
import { useSessionScroll } from "./rank/useSessionScroll.js";
import { useRankAxes } from "../lib/RankAxesContext.js";
import { isComputedAxis, valueDomain, valueToFrac } from "../lib/computedAxis.js";
import { useLinkedSet } from "./filter/useSetBinding.js";
import { SetBindingLabel } from "./filter/SetBindingLabel.js";
import { setMembersOf } from "./filter/setMembers.js";
import { parseCellMode, CELL_MODE_LABEL, type CellMode, type ValuedCell } from "./rank/sheetCell.js";
import { PanelHeader, ScrollRow, miniBtn, mutedNote } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { pointKey } from "../lib/pointKey.js";
import { subjectStatus, useSubject } from "../lib/subject.js";
import { useStockNames } from "../lib/useStockNames.js";
import { SubjectBadge } from "../components/SubjectBadge.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import type { ReviewPoint } from "@trade-data-manager/wire";

// 타점 분석 시트 — 행=타점 · 열=축별 순위 + 결과. 배치 현황과 결과 목록을 한 표로 통합.
//  · 셀 = 숫자 / 순위 눈금 / 값 눈금(토글). 계산 축은 숫자에 값이 먼저 오고(`+12.3% (3/12)`), 값 눈금은
//    **필터 보드 레일과 같은 좌표**라 쏠림이 보인다. 판단 축은 순서뿐이라 값 눈금이 순위 눈금으로 폴백한다.
//    미배치 = 빈칸.
//  · 헤더 클릭 = 그 열로 정렬(축은 강 먼저) · **Shift+클릭 = 정렬 단 추가**(n차). 정렬 축에서 행범위
//    체인·그룹 규칙은 sheetSort(순수·테스트)에. 필터(밴드·값구간)는 필터 패널로 이사 — 시트는 결과를 구독만.
//  · **행 묶기**: 1차 키에서만 접는다. 날짜·결과·배치수처럼 값이 몇 가지뿐인 열은 저절로, 축처럼 값이 거의
//    유일한 열은 셀 우클릭 **그룹 나누기(컷)** 를 그었을 때만. 컷은 "한 구간만 남기는" 밴드와 달리 아무것도
//    안 버리고 N개로 나눈다 → 구간끼리 한 화면에서 비교된다(밴드는 분석 모수까지 좁힌다는 게 다른 점).
//  · 드래그 배치는 축 열이 **순위 순서 그대로일 때만** 유효 — 깨지는 건 컷과 2차 정렬이 둘 다 있을 때뿐이다
//    (2차는 원래 1차 동률 안에서만 도니까 열은 단조로 남는다). 그때만 끄고 헤더에 사유를 띄운다.
//  · 필터 활성 시 행=보는 집합(좁히기) 또는 전체+흐리게. **깔때기를 직접 구독**한다(어댑터 없음).
//  · **배치 보드가 사라져 여기가 축의 유일한 입구다**: 만들기(컨트롤 바 `+ 축`) · 이름 변경·삭제(열 이름 우클릭) ·
//    꽂기(핀 행을 정렬 축 열로 드래그) · 해제(셀 우클릭). 계산 축은 코드가 정의라 만들기·이름·배치가 없다.
//  · **비고정** 축 열의 드래그 재정렬은 store rankAxisOrder 를 만진다(필터 보드 레일 순서와 공유).
//    고정한 열은 시트 전용 자리 — 고정 그룹 안에서만 순서를 바꾼다(순서 소스가 둘이라 규칙을 갈랐다).
//  · 열 폭은 손으로 조절 가능(헤더 오른쪽 가장자리 드래그). **수동 폭과 계산 축이 고정폭**이고, 나머지 축 열이
//    남는 폭을 나눠 갖는다 → "폭 원위치"(수동 폭 삭제)면 기본 동작으로 정확히 복귀한다.
//  · **결과(outcome)** = 손으로 적는 큐레이션 값(통계 아님) — 그 셀 우클릭이 입력 입구다.
//  · **그룹(태그)은 시트에 없다** — 좁은 셀에 넣으면 이름이 잘려 색만 남고, 그 색을 읽으려면 결국 다른 패널을
//    봐야 한다. 그룹은 조상 경로까지 보여야 뜻이 서므로 폭이 있는 자리(필터 보드·팔레트·타점 정보)의 일이다.
//
// 구성(분해): 열 구성=useSheetColumns · 헤더 줄=SheetHeaderRow · 드래그 배치=useSheetDragPlacement ·
// 축 관리/결과=useAxisAdmin · 팝업 네 벌=SheetMenusHost · 세션 스크롤=useSessionScroll.
// 본체는 **데이터 파생과 조립**만 한다.

const POS_MODE_KEY = "wb.rankSheetPosMode";
const FILTERMODE_KEY = "wb.rankSheetFilterMode";
const SORT_KEY = "wb.rankSheetSort"; // 정렬 체인 영속(다른 시트 설정과 동일 패턴) — 프리셋 전환·새로고침에 유지. 옛 단일 정렬도 읽는다.
// 무필터 상태의 매칭 집합 — 참조 하나로 고정해 useMemo 결과가 렌더마다 안 바뀌게(깔때기 쪽 상수 패턴과 동일).
const EMPTY_KEYS: ReadonlySet<string> = new Set();

export function RankSheetPanel(): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    // 지금 선택(subject) — 타점 또는 하루. 행 강조·스크롤 따라가기·머리글 배지가 이걸 본다.
    const subject = useSubject();
    const isSubjectRow = (r: { stockCode: string; date: string; time: string }): boolean =>
        subject !== null && r.stockCode === subject.code && r.date === subject.date &&
        (subject.time === null || r.time === subject.time);

    // 호버는 React 상태가 아니라 CSS :hover 다(.sheet-row, theme.css) — 행 배경·핀 손잡이 노출이
    // 전부라, 상태로 들면 행 하나 스칠 때마다 패널이 두 번씩 리렌더된다(2026-08-20 검수).
    // 핀(작업셋)·축 순서는 여전히 공유 상태 — 다른 화면(작업 대상·필터 보드 레일)이 같은 걸 본다.
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    // ── 축 + 라인(배치 보드와 공유) → 순위 인덱스. 열 재정렬도 같은 store 순서를 만진다.
    // 계산 축을 함께 본다 — 판단 축과 같은 줄 모양으로 합쳐져 열·정렬·순위 셀이 구분 없이 동작한다.
    // 다만 **읽기 전용**: 배치/해제·밴드·컷은 계산 축 열에서 열리지 않는다(isComputedAxis 가드).
    const { axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading: axesLoading, reorder: reorderAxis } = useRankAxes();
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
    const cols = useSheetColumns({ axes, axesLoading, containerW, axisMin });
    const { displayCols, leftOf, tableW, lastFrozenKey, widthOf } = cols;

    // ── 전체 타점(행 원천) + 기간.
    const pointsQ = useQuery(allPointsQuery());
    const allPoints = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);
    const allByKey = useMemo(() => {
        const m = new Map<string, ReviewPoint>();
        for (const p of allPoints) m.set(pointKey(p), p);
        return m;
    }, [allPoints]);

    // ── 보는 집합 — 연동 하나(전역 선택 포인터 + 월 시선 구독, 주인은 작업셋). 사이드바 재편(2026-08-21)으로
    //    패널별 고정 바인딩·집합 사이드바는 폐지 — 멤버 브라우징·표현 안 됨은 작업셋이 담당한다.
    const linked = useLinkedSet();
    const bandsActive = linked.view.isFiltering;
    // 무필터면 매칭이라는 개념 자체가 없다 — 전 우주 Set 을 짓지 않는다(수천 타점이면 그게 그대로 비용).
    const interKeys = useMemo<ReadonlySet<string>>(
        () => (linked.view.isFiltering ? new Set(linked.view.viewedPointRefs.map(pointKey)) : EMPTY_KEYS),
        [linked.view.isFiltering, linked.view.viewedPointRefs],
    );
    // 표현가능 술어 — 시트의 행이 될 수 있나 = 타점 사전에 있나. 타점 0인 하루는 전개가 못 살리므로 안 됨에 선다.
    const setMembers = useMemo(
        () => setMembersOf(linked.view, "point", (it) => it.time !== undefined && allByKey.has(pointKey({ stockCode: it.stockCode, date: it.date, time: it.time }))),
        [linked.view, allByKey],
    );

    // 필터 표시 모드 — narrow(교집합만) / dim(전체 유지, 밴드 밖 흐리게). 영속.
    const [filterMode, setFilterMode] = usePersistedState<"narrow" | "dim">(FILTERMODE_KEY, (o) => (o === "dim" ? "dim" : o === "narrow" ? "narrow" : null), "narrow");

    // 행 집합: narrow + 필터 활성 → 매칭 집합만. dim 또는 무필터 → 전체(밴드 밖은 렌더에서 흐리게).
    const rowPoints = useMemo<ReviewPoint[]>(() => {
        if (bandsActive && filterMode === "narrow") {
            const out: ReviewPoint[] = [];
            for (const k of interKeys) { const it = allByKey.get(k); if (it) out.push(it); }
            return out;
        }
        return allPoints;
    }, [bandsActive, filterMode, interKeys, allByKey, allPoints]);

    const rows = useMemo(() => buildSheetRows(rowPoints, axisIds, indexByAxis), [rowPoints, axisIds, indexByAxis]);

    // ── 정렬 체인(n차). 평클릭=리셋 · Shift+클릭=단 추가. 규칙 전부는 sheetSort(순수·테스트) 에.
    //    축 정렬 = 강(rank↑) 먼저, 값 없음(미배치·미산정)은 방향 무관 바닥. localStorage 영속(옛 단일 정렬도 읽는다).
    const [sort, setSort] = usePersistedState<SortChain>(SORT_KEY, parseSortChain, DEFAULT_CHAIN);
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
        const items = pinned.map((k) => allByKey.get(k)).filter((x): x is ReviewPoint => !!x);
        return buildSheetRows(items, axisIds, indexByAxis);
    }, [pinned, allByKey, axisIds, indexByAxis]);
    const mainRows = sorted; // 핀 행도 기존 위치에 그대로(상단 고정 블록에 중복 표시, 삼각형으로 구분)

    // 선택의 정의역 판정 — 시트의 재료는 타점이다. 하루 선택이면 그날 타점 아무거나(subject.ts 규칙).
    const subjectRowKey = useMemo(() => {
        const r = mainRows.find(isSubjectRow);
        return r ? pointKey(r) : null;
    }, [mainRows, subject]);
    const subjectInData = useMemo(
        () => subject !== null && allPoints.some(isSubjectRow),
        [allPoints, subject],
    );
    const status = subjectStatus(subjectInData, subjectRowKey !== null);

    const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());     // 행 pk → tr(드롭 Y 판정 + 선택 따라가기)
    // 선택 따라가기 — 행이 있으면 그 자리로 스크롤(사용자 확정: 고정 대신 스크롤).
    //  · 내가(rank-sheet) 바꾼 선택엔 안 움직인다 — 행을 눌렀는데 화면이 튀면 클릭이 벌이 된다.
    //  · 마운트 첫 판정도 건너뛴다 — 세션 스크롤 복원(useSessionScroll)과 싸우지 않게.
    const followedRef = useRef<string | null>(null);
    useEffect(() => {
        if (followedRef.current === null) { followedRef.current = subjectRowKey ?? ""; return; }
        if (subjectRowKey === null || subjectRowKey === followedRef.current) { followedRef.current = subjectRowKey ?? ""; return; }
        followedRef.current = subjectRowKey;
        if (useWorkbench.getState().lastFocusOrigin === "rank-sheet") return;
        rowRefs.current.get(subjectRowKey)?.scrollIntoView({ block: "center" });
    }, [subjectRowKey]);

    // ── 축 관리·결과 저장(뮤테이션 배선) — useAxisAdmin. 키 이관은 invalidate 앞에(훅 주석 참고).
    const admin = useAxisAdmin({ migrateAxisKey: cols.migrateAxisKey, allPoints });

    const clickHeader = (key: SortKey, shift: boolean): void => setSort((s) => (shift ? pushSort(s, key) : resetSort(s, key)));
    const unplacedOnSort = sortAxisId ? mainRows.filter((row) => !row.cells[sortAxisId]).length : 0;
    // 드래그 배치는 **축 열이 순위 순서 그대로일 때만** 유효하다(행 사이 = 순위 구간이어야 하므로).
    // 순서가 깨지는 건 컷과 2차 정렬이 **둘 다** 있을 때뿐 — 컷만 있거나 2차만 있으면 열은 여전히 단조다.
    const dragBroken = cutsActive(sort, cutKeys) && sort.length > 1;
    // 계산 축은 드롭 대상이 아니다 — 자리를 값이 정하므로 꽂을 곳이 없다(보정은 후속 브릭).
    const dragAxisId = dragBroken || (sortAxisId && isComputedAxis(sortAxisId)) ? null : sortAxisId;

    /**
     * 계산 축이 이 타점에 대해 아는 값 — 값의 자리(레일과 같은 좌표)와 표기.
     * 판단 축은 값이 없어 undefined 를 준다(셀이 순위로 폴백).
     */
    const valueViews = useMemo(() => {
        const m = new Map<string, { values: Map<string, number>; domain: { min: number; max: number }; strongerWhen: "higher" | "lower"; fmt: (v: number) => string }>();
        for (const [axisId, values] of computedValues) {
            const domain = valueDomain(values);
            const meta = computedMeta.get(axisId);
            if (domain && meta) m.set(axisId, { values, domain, strongerWhen: meta.strongerWhen, fmt: meta.fmt });
        }
        return m;
    }, [computedValues, computedMeta]);
    // 참조 고정 — SheetRowView(memo)가 얕은 비교로 재사용하도록.
    const valuedOf = useMemo(() => (axisId: string, row: SheetRow): ValuedCell | undefined => {
        const view = valueViews.get(axisId);
        const v = view?.values.get(pointKey(row));
        return view && v !== undefined ? { frac: valueToFrac(v, view.domain, view.strongerWhen), text: view.fmt(v) } : undefined;
    }, [valueViews]);

    // 스크롤 위치 세션 복원 — 데이터가 그려진(표 렌더된) 뒤 1회. onScroll 로 저장(useSessionScroll).
    const dataReady = !axesLoading && !pointsQ.isLoading && axes.length > 0;
    const scroll = useSessionScroll(scrollRef, dataReady);

    // ── 팝업 네 벌(셀/열 우클릭 · 축 만들기 · 결과 입력)의 상태 — opener 만 행·헤더·컨트롤에 나눠 꽂는다.
    const menus = useSheetMenus();

    const navRow = (row: SheetRow): void => goToPoint({ date: row.date, code: row.stockCode, time: row.time }, "rank-sheet");
    const totalCols = displayCols.length;

    // ── 드래그 배치 — 핀(고정) 행 이름 → 정렬된 축 열. 정렬이 축일 때만 유효(그때만 열이 세로 라인).
    const drag = useSheetDragPlacement({ dragAxisId, mainRows, rowRefs, scrollRef, primaryDir: primary.dir, nameOf });

    // 행 핸들러 묶음 — SheetRowView(memo)가 얕은 비교로 재사용하도록 **참조를 고정**한다(useRef 경유,
    // 내용물은 매 렌더 최신 클로저로 갱신 — useChartHotkeys 의 h.current 패턴과 같은 이유).
    const rowHandlersRef = useRef<SheetRowHandlers>({} as SheetRowHandlers);
    rowHandlersRef.current.onNav = navRow;
    rowHandlersRef.current.onTogglePin = togglePin;
    rowHandlersRef.current.onCellCtx = menus.openCellCtx;
    rowHandlersRef.current.onOutcomeCtx = menus.openOutcomeCtx;
    rowHandlersRef.current.registerRef = (key, el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); };
    const rowH = rowHandlersRef.current;

    // 한 행 렌더 — 상태 파생(포커스·핀·흐림)만 여기서 계산하고 렌더는 SheetRowView(memo). 호버는 CSS.
    const renderRow = (row: SheetRow, isLastPinned = false, inPinnedBlock = false): JSX.Element => {
        const key = pointKey(row);
        const isPinned = pinnedSet.has(key);
        return (
            <SheetRowView key={key} row={row} cols={displayCols}
                leftOf={leftOf} lastFrozenKey={lastFrozenKey} widthOf={widthOf}
                name={nameOf(row.stockCode)}
                mode={cellMode} valuedOf={valuedOf} sortAxisId={sortAxisId}
                focus={isSubjectRow(row)} pinned={isPinned}
                dim={bandsActive && !interKeys.has(key) && (isPinned || filterMode === "dim")}
                inPinnedBlock={inPinnedBlock} isLastPinned={isLastPinned} h={rowH} />
        );
    };

    // 헤더 컨트롤 선언 — 눈금·필터모드·축 만들기. 아래 "⤺" 해제 손잡이들은 여기 안 든다:
    // 걸린 게 있을 때만 뜻이 생기는 **문맥 손잡이**라 성격이 다르다(개수가 곧 정보다).
    const controls: ControlSpec[] = [
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
            kind: "action", id: "addAxis", name: "+ 축",
            help: "판단 축 새로 만들기(이름 변경·삭제는 열 이름 우클릭). 계산 축은 코드로 정의된다",
            run: (at) => menus.openAddAxis({ x: at.clientX, y: at.clientY }),
        },
    ];

    if (axesLoading || pointsQ.isLoading) return <Wrap><div style={muted}>불러오는 중…</div></Wrap>;
    if (axes.length === 0) return <Wrap><div style={muted}>축이 없습니다. 위 <b>+ 축</b>으로 먼저 만들어 주세요.</div></Wrap>;

    return (
        <Wrap>
          <DndContext sensors={drag.sensors} onDragStart={drag.onDragStart} onDragMove={drag.onDragMove} onDragEnd={drag.onDragEnd} onDragCancel={drag.onDragCancel}>
            {/* 머리글 — 왼쪽은 말(바인딩 라벨·행수·선택 배지·"⤺" 해제들), 오른쪽은 손(HeaderControls).
                "⤺" 들이 왼쪽에 남는 건 걸린 게 있을 때만 뜻이 생기는 **문맥 손잡이**라서다 — 개수가 곧 정보고,
                컨트롤처럼 늘 서 있는 것이 아니다. 바인딩 라벨이 칩(버튼)에서 못 누르는 말로 내려온 것도
                그 잣대다: 늘 서 있는 손잡이였으니 사라지는 것들 틈이 아니라 컨트롤 줄이 제자리다. */}
            <PanelHeader gap={8}>
                <ScrollRow gap={9}>
                    <SetBindingLabel linked={linked} members={setMembers} />
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>{mainRows.length}행{bandsActive ? ` · 매칭 ${interKeys.size}` : ""}{sortAxisId && unplacedOnSort > 0 ? ` · 미배치 ${unplacedOnSort}` : ""}</span>
                    {/* 선택이 이 표에 없을 때만 그 이유를 말한다 — 필터 밖(좁히기로 빠짐)과 타점 없음(하루 선택 등)은 다른 문제다. */}
                    <SubjectBadge subject={subject} status={status} name={subject ? nameOf(subject.code) : undefined} absentLabel="타점 없음" />
                    {/* 컷과 2차 정렬이 둘 다 걸리면 축 열이 순위 순서가 아니라 행 사이 드롭이 뜻을 잃는다 — 왜 안 되는지 보이게. */}
                    {dragBroken && <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>· 그룹 안 정렬 중 — 배치 드래그 꺼짐</span>}
                    {sort.length > 1 && <button onClick={() => setSort((s) => [s[0]])} title="2차 이하 정렬 해제(1차만 남김)" style={{ ...miniBtn, flexShrink: 0 }}>정렬 {sort.length}단 ⤺</button>}
                    {cutKeys.length > 0 && <button onClick={() => cols.clearCuts(sortAxisId!)} title="이 축의 그룹 컷 모두 해제" style={{ ...miniBtn, flexShrink: 0 }}>그룹 {cutKeys.length + 1} ⤺</button>}
                    {cols.hiddenCols.length > 0 && <button onClick={cols.showAllHidden} title="숨긴 열 모두 보이기" style={{ ...miniBtn, flexShrink: 0 }}>숨긴 열 {cols.hiddenCols.length} ⤺</button>}
                    {cols.hasManualWidths && <button onClick={cols.resetWidths} title="손으로 조절한 열 폭 전부 해제(기본 폭·축 잔여 분배로 복귀)" style={{ ...miniBtn, flexShrink: 0 }}>폭 원위치 ⤺</button>}
                </ScrollRow>
                <HeaderControls controls={controls} storageKey="wb.headerPins.rankSheet" />
            </PanelHeader>

            {/* 표 — 고정폭(table-layout:fixed)·유연 축폭·열 고정(좌측 스택)·핀 행=헤더 블록 상단 고정·날짜 그룹 */}
            {/* 표와 집합 사이드바가 한 줄 — 사이드바는 오른쪽(목록이 표를 밀어내는 방향). */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <div ref={scrollRef} onScroll={scroll.onScroll} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto" }}>
                {/* border-collapse: separate — 테두리가 셀에 붙어 sticky(고정 열/헤더/핀)를 따라옴(밑줄·세로선 안 밀림). */}
                <table style={{ tableLayout: "fixed", width: tableW, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
                    <colgroup>{displayCols.map((c) => <col key={colKey(c)} style={{ width: widthOf(c) }} />)}</colgroup>
                    {/* 헤더 블록 = 열 헤더 + 핀 행(둘 다 상단 sticky, 틈·비침 없이 하나로) */}
                    <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--bg-secondary)" }}>
                        <SheetHeaderRow displayCols={displayCols} cols={cols} sort={sort} sortAxisId={sortAxisId}
                            sortAxisThRef={drag.sortAxisThRef} reorderAxis={reorderAxis}
                            onSort={clickHeader} onHeaderCtx={menus.openHdrCtx} />
                        {pinnedRows.map((row, j) => renderRow(row, j === pinnedRows.length - 1, true))}
                    </thead>
                    <tbody>
                        {/* 그룹 = 1차 키에서만 접는다(이산 열은 저절로, 축은 사람이 그은 컷). label=null 이면 통짜 → 헤더 없음. */}
                        {groups.flatMap((g) => {
                            const out: JSX.Element[] = [];
                            if (g.label != null) out.push(
                                <tr key={`g-${g.id}`} style={{ height: 22 }}>
                                    <td colSpan={totalCols} style={{ padding: 0, fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", background: "var(--bg-secondary)", borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-default)" }}>
                                        <span style={{ position: "sticky", left: 0, display: "inline-block", padding: "3px 10px" }}>
                                            {g.label}<span style={{ fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 6 }}>· {g.rows.length}행</span>
                                        </span>
                                    </td>
                                </tr>,
                            );
                            for (const row of g.rows) out.push(renderRow(row));
                            return out;
                        })}
                    </tbody>
                </table>
                {/* 고정 블록(핀)은 조건에 맞아서 있는 게 아니다 — 그게 차 있어도 "맞는 게 없다"는 사실은 말해야 한다. */}
                {mainRows.length === 0 && <div style={muted}>{bandsActive ? "이 조건에 맞는 타점이 없습니다." : "이 기간에 타점이 없습니다."}</div>}
            </div>
            </div>

            {drag.overlay}
          </DndContext>

          {drag.indicator}

          <SheetMenusHost m={menus} axes={axes} cols={cols} sortAxisId={sortAxisId} sortLen={sort.length}
              dropSortKey={(k) => setSort((s) => dropSort(s, k))} unplace={drag.unplace} admin={admin} />
        </Wrap>
    );
}

const Wrap = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>{children}</div>
);
const muted = mutedNote;
