import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
    type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { axisLinesQuery, allPointsQuery } from "../api/queries.js";
import { placePoint, unplacePoint, type RankPoint, type RankTarget } from "../api/rank.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { buildSheetRows, type SheetRow } from "./rank/rankSheet.js";
import { COL_META, MIN_COL_W, colKey, colLabel, layoutColumns, pruneAxisKeys, reorderFrozenCols, type Col } from "./rank/sheetColumns.js";
import {
    DEFAULT_CHAIN, buildSheetGroups, cutsActive, dropSort, parseSortChain, pushSort, resetSort, resolveCutKeys,
    sortKeyOf, sortSheetRows, sortStepNo, type SortChain, type SortCtx, type SortKey,
} from "./rank/sheetSort.js";
import { buildAxisIndex, slotOrderKeys, type AxisIndex } from "../lib/rankIndex.js";
import { SheetRowView, ROW_H, type CellCtxPayload, type SheetRowHandlers } from "./rank/SheetRowView.js";
import { useRankAxes } from "../lib/useRankAxes.js";
import { isComputedAxis } from "../lib/computedAxis.js";
import { computeRowDrop, type RowGeom } from "./rank/rankGeometry.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { useGroups } from "../lib/useGroups.js";
import { pointKey, pointKeyOf, parsePointKey } from "../lib/pointKey.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";
import type { Excursion } from "./rank/pathStats.js";

// 타점 분석 시트 — 행=타점 · 열=축별 순위 + 결과. 배치 현황과 결과 목록을 한 표로 통합.
//  · 셀 = 그 축 순위 `rank/total`(기본) 또는 위치 바(토글). 미배치 = 빈칸.
//  · 헤더 클릭 = 그 열로 정렬(축은 강 먼저) · **Shift+클릭 = 정렬 단 추가**(n차). 정렬 축에서 행범위
//    체인·그룹 규칙은 sheetSort(순수·테스트)에. 필터(밴드·값구간)는 필터 패널로 이사 — 시트는 결과를 구독만.
//  · **그룹**: 1차 키에서만 접는다. 날짜·결과·그룹·배치수처럼 값이 몇 가지뿐인 열은 저절로, 축처럼 값이 거의
//    유일한 열은 셀 우클릭 **그룹 나누기(컷)** 를 그었을 때만. 컷은 "한 구간만 남기는" 밴드와 달리 아무것도
//    안 버리고 N개로 나눈다 → 구간끼리 한 화면에서 비교된다(밴드는 분석 모수까지 좁힌다는 게 다른 점).
//  · 드래그 배치는 축 열이 **순위 순서 그대로일 때만** 유효 — 깨지는 건 컷과 2차 정렬이 둘 다 있을 때뿐이다
//    (2차는 원래 1차 동률 안에서만 도니까 열은 단조로 남는다). 그때만 끄고 헤더에 사유를 띄운다.
//  · 밴드 활성 시 행=교집합, 결과 열(MFE/MAE/결과)이 lazy 로 붙는다(좁혔을 때만 경로 fetch). 미배치는 strict AND 로 탈락.
//  · 기간(전체/월)은 독립 필터. **비고정** 축 열의 드래그 재정렬은 배치 보드와 양방향 동기화(store rankAxisOrder).
//    고정한 열은 시트 전용 자리 — 고정 그룹 안에서만 순서를 바꾸고 배치 보드는 안 건드린다(순서 소스가 둘이라 규칙을 갈랐다).
//  · 열 폭은 손으로 조절 가능(헤더 오른쪽 가장자리 드래그). **수동 폭을 준 열만 고정폭**이 되고, 안 준 축 열들은
//    지금처럼 남는 폭을 나눠 갖는다 → "폭 원위치"(수동 폭 삭제)면 기본 동작으로 정확히 복귀한다.
//  · 링크: 드래그=소프트 선택(색만, 안 좁힘, 누적) · 우클릭=밴드(좁힘)+그 축 배치 해제 · 선택/호버는 배치 보드와 공유(색으로 표시).
//  · 그룹 셀 = **읽기 전용**(GroupChips). 편집은 골격 패널에서만 — 입구가 여럿이면 하나가 죽은 기능이 된다.

const POS_MODE_KEY = "wb.rankSheetPosMode";
const FROZEN_KEY = "wb.rankSheetFrozenCols";
const HIDDEN_KEY = "wb.rankSheetHiddenCols";
const WIDTHS_KEY = "wb.rankSheetColWidths";
const FILTERMODE_KEY = "wb.rankSheetFilterMode";
const SORT_KEY = "wb.rankSheetSort"; // 정렬 체인 영속(다른 시트 설정과 동일 패턴) — 프리셋 전환·새로고침에 유지. 옛 단일 정렬도 읽는다.
const CUTS_KEY = "wb.rankSheetCuts";  // 축 열 그룹 컷 — colKey(`ax:<id>`) → slotId[]. 시트 전용(축의 속성 아님)이라 로컬.
// 스크롤 위치는 세션 한정(모듈 메모) — 프리셋 전환(재마운트)엔 이어지고 새로고침엔 초기화(목록 중간 튐 방지).
let sheetScroll = { top: 0, left: 0 };
// 열 헤더 드래그의 두 종류 — 미디어타입으로 갈라 서로의 드롭을 안 받는다(고정 그룹 재정렬 vs 축 서열 변경).
const AXIS_DND = "application/x-rank-axis";
const COL_DND = "application/x-rank-col";

// ── 드래그 배치(고정 행 → 정렬된 축 열) ─────────────────────────────────────
// 정렬 축 열 = 그 축의 세로 라인(행이 orderKey 순). 핀 행 이름을 드래그해 두 행 사이(between=새 slot)/행 위(tie=같은 slot)에 놓는다.
const draggedPoint = (id: unknown): RankPoint | null =>
    typeof id === "string" && id.startsWith("chip:") ? parsePointKey(id.slice(5)) : null;
// 드롭 인디케이터(body portal, fixed) — between=열 위 가로선, tie=행 테두리 링. x0..x1 = 정렬 축 열 범위.
interface SheetDrop { target: RankTarget; tie: boolean; y: number; rowTop?: number; rowBottom?: number; x0: number; x1: number; }

export function RankSheetPanel(): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const activePoint = useWorkbench((s) => s.activePoint);
    const activeKey = activePoint ? pointKeyOf(activePoint.code, activePoint.date, activePoint.time) : null;

    // ── 링크 공유 상태(배치 보드와 양방향) — 호버·핀·축순서.
    const hoveredPoint = useWorkbench((s) => s.hoveredPoint);
    const setHoveredPoint = useWorkbench((s) => s.setHoveredPoint);
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    // ── 축 + 라인(배치 보드와 공유) → 순위 인덱스. 열 재정렬도 같은 store 순서를 만진다.
    // 계산 축을 함께 본다 — 판단 축과 같은 줄 모양으로 합쳐져 열·정렬·순위 셀이 구분 없이 동작한다.
    // 다만 **읽기 전용**: 배치/해제·밴드·컷은 계산 축 열에서 열리지 않는다(아래 isComputedAxis 가드).
    const { axes, axisIds, linesByAxis, isLoading: axesLoading, reorder: reorderAxis } = useRankAxes({ includeComputed: true });
    const indexByAxis = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        for (const [axisId, placed] of linesByAxis) m.set(axisId, buildAxisIndex(placed));
        return m;
    }, [linesByAxis]);

    // ── 그룹(부착 피드 한 벌 — 차트·타점 정보 패널과 같은 캐시). 시트는 조회만 하고 편집은 골격 패널에서.
    const { groupsOf } = useGroups();
    const groupLabel = (row: { stockCode: string; date: string; time: string }): string => groupsOf(row).map((t) => t.name).join(", ");

    // ── 전체 타점(행 원천) + 기간.
    const pointsQ = useQuery(allPointsQuery());
    const allPoints = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);
    const allByKey = useMemo(() => {
        const m = new Map<string, ReviewPointListItem>();
        for (const p of allPoints) m.set(pointKey(p), p);
        return m;
    }, [allPoints]);

    // ── 결과(분석) — 통합 필터(밴드·날짜·시간) 매칭 집합 + 경로 통계(좁혔을 때만 lazy). 기간은 이제 날짜 필터에 흡수.
    const r = useRankFilterResult();
    const bandsActive = !r.isEmpty; // 필터(밴드/날짜/시간 중 하나라도) 활성
    const interKeys = useMemo(() => new Set(r.points.map(pointKey)), [r.points]);
    const excByKey = useMemo(() => {
        const m = new Map<string, Excursion>();
        for (const e of r.stats.excursions) m.set(e.key, e);
        return m;
    }, [r.stats.excursions]);

    // 필터 표시 모드 — narrow(교집합만) / dim(전체 유지, 밴드 밖 흐리게). 영속.
    const [filterMode, setFilterMode] = usePersistedState<"narrow" | "dim">(FILTERMODE_KEY, (o) => (o === "dim" ? "dim" : o === "narrow" ? "narrow" : null), "narrow");

    // 행 집합: narrow + 필터 활성 → 매칭 집합만. dim 또는 무필터 → 전체(밴드 밖은 렌더에서 흐리게).
    const rowPoints = useMemo<ReviewPointListItem[]>(() => {
        if (bandsActive && filterMode === "narrow") {
            const out: ReviewPointListItem[] = [];
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
    // 정렬 기준을 배치 보드와 공유 → 그 레일에 하이라이트/배지. **1차만**(2차 이하는 대응 레일이 없다).
    const setRankSort = useWorkbench((s) => s.setRankSort);
    useEffect(() => {
        const k = primary.key;
        const target = k.kind === "axis" ? k.axisId : k.kind === "date" || k.kind === "time" ? k.kind : null;
        setRankSort(target ? { target, dir: primary.dir } : null);
    }, [primary, setRankSort]);
    const nameOf = (code: string): string => r.nameOf(code);

    // ── 그룹 컷(축 열 전용) — 1차 축에서 우클릭으로 그은 경계. slotId 로 저장하고 축 라인으로 orderKey 를 되찾는다.
    const [cuts, setCuts] = usePersistedState<Record<string, string[]>>(CUTS_KEY, (o) => (o && typeof o === "object" ? (o as Record<string, string[]>) : null), {});
    const sortAxisId = primary.key.kind === "axis" ? primary.key.axisId : null;
    const slotOrderOfSort = useMemo(() => (sortAxisId ? slotOrderKeys(linesByAxis.get(sortAxisId) ?? []) : undefined), [sortAxisId, linesByAxis]);
    const cutKeys = useMemo(
        () => (sortAxisId ? resolveCutKeys(cuts[`ax:${sortAxisId}`] ?? [], slotOrderOfSort) : []),
        [sortAxisId, cuts, slotOrderOfSort],
    );
    const toggleCut = (axisId: string, slotId: string): void => setCuts((m) => {
        const k = `ax:${axisId}`;
        const cur = m[k] ?? [];
        const next = cur.includes(slotId) ? cur.filter((s) => s !== slotId) : [...cur, slotId];
        return next.length ? { ...m, [k]: next } : Object.fromEntries(Object.entries(m).filter(([x]) => x !== k));
    });

    const sortCtx = useMemo<SortCtx>(() => ({
        nameOf: (code) => r.nameOf(code),
        groupLabel,
        excursionOf: (row) => excByKey.get(pointKey(row)),
    }), [r.nameOf, groupsOf, excByKey]); // eslint-disable-line react-hooks/exhaustive-deps -- groupLabel 은 groupsOf 파생
    const sorted = useMemo(() => sortSheetRows(rows, sort, sortCtx, cutKeys), [rows, sort, sortCtx, cutKeys]);
    const groups = useMemo(() => buildSheetGroups(sorted, sort, sortCtx, cutKeys), [sorted, sort, sortCtx, cutKeys]);

    // 핀은 필터/정렬 무관 상단 고정 행(작업셋), 일반 행에서는 제외(중복 방지).
    const pinnedRows = useMemo(() => {
        const items = pinned.map((k) => allByKey.get(k)).filter((x): x is ReviewPointListItem => !!x);
        return buildSheetRows(items, axisIds, indexByAxis);
    }, [pinned, allByKey, axisIds, indexByAxis]);
    const mainRows = sorted; // 핀 행도 기존 위치에 그대로(상단 고정 블록에 중복 표시, 삼각형으로 구분)

    const clickHeader = (key: SortKey, shift: boolean): void => setSort((s) => (shift ? pushSort(s, key) : resetSort(s, key)));
    const unplacedOnSort = sortAxisId ? mainRows.filter((row) => !row.cells[sortAxisId]).length : 0;
    // 드래그 배치는 **축 열이 순위 순서 그대로일 때만** 유효하다(행 사이 = 순위 구간이어야 하므로).
    // 순서가 깨지는 건 컷과 2차 정렬이 **둘 다** 있을 때뿐 — 컷만 있거나 2차만 있으면 열은 여전히 단조다.
    const dragBroken = cutsActive(sort, cutKeys) && sort.length > 1;
    // 계산 축은 드롭 대상이 아니다 — 자리를 값이 정하므로 꽂을 곳이 없다(보정은 후속 브릭).
    const dragAxisId = dragBroken || (sortAxisId && isComputedAxis(sortAxisId)) ? null : sortAxisId;

    // ── 위치 표시 모드(숫자 기본 / 위치 바).
    const [posBar, setPosBar] = usePersistedState<boolean>(POS_MODE_KEY, (o) => (typeof o === "boolean" ? o : null), true);

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
    // 스크롤 위치 세션 복원 — 데이터가 그려진(표 렌더된) 뒤 1회. onScroll 로 sheetScroll 에 저장한다.
    const restoredRef = useRef(false);
    const dataReady = !axesLoading && !pointsQ.isLoading && axes.length > 0;
    useEffect(() => {
        if (!dataReady || restoredRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = sheetScroll.top;
        el.scrollLeft = sheetScroll.left;
        restoredRef.current = true;
    }, [dataReady]);
    const ctrlWheel = useHorizontalWheel<HTMLDivElement>(true); // 헤더 컨트롤 hover 휠 = 가로 스크롤
    const axisMin = posBar ? 76 : 56;

    // ── 열 구성 — 고정(좌측 스택 집합)·숨김(집합), 열 이름 우클릭 메뉴로 편집. 영속.
    const [frozenCols, setFrozenCols] = usePersistedState<string[]>(FROZEN_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null), ["date", "time"]);
    const [hiddenCols, setHiddenCols] = usePersistedState<string[]>(HIDDEN_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null), []);
    const frozenSet = useMemo(() => new Set(frozenCols), [frozenCols]);
    // 수동 열 폭(colKey → px). 지정한 열만 고정폭이 되고, 나머지 축 열은 잔여 폭 분배를 유지한다.
    const [colWidths, setColWidths] = usePersistedState<Record<string, number>>(WIDTHS_KEY, (o) => (o && typeof o === "object" ? (o as Record<string, number>) : null), {});
    // 축을 지우면 그 축 키가 고정/숨김/폭 목록에 유령으로 남는다 → 축 목록이 로드된 뒤 한 번 청소.
    // ⚠ **로딩 중엔 절대 청소하지 않는다**: 판단 축과 계산 축은 별도 요청이라, 판단 축만 도착한 순간에 돌면
    //   아직 안 온 계산 축 열의 고정·숨김·폭을 유령으로 오인해 지운다.
    useEffect(() => {
        if (axesLoading || axes.length === 0) return;
        const ids = axes.map((a) => a.id);
        setFrozenCols((f) => pruneAxisKeys(f, ids));
        setHiddenCols((h) => pruneAxisKeys(h, ids));
        setColWidths((w) => pruneAxisKeys(w, ids));
        setCuts((c) => pruneAxisKeys(c, ids));
    }, [axes, axesLoading]);
    const toggleFrozen = (k: string): void => setFrozenCols((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
    // 고정 그룹 안 재정렬 — 배열이 곧 좌측 스택 순서다. 축 열이 섞여 있어도 여기선 배열만 만진다(축 서열 불변).
    const reorderFrozen = (dragged: string, target: string): void => setFrozenCols((f) => reorderFrozenCols(f, dragged, target));
    const toggleHidden = (k: string): void => setHiddenCols((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));

    // 기본 순서 → 숨김 제외 → 고정 먼저(기본순 유지, 좌측 스택) → 비고정. 종목은 항상 표시·고정.
    const baseCols = useMemo<Col[]>(() => [
        { key: "name" }, { key: "date" }, { key: "time" }, { key: "groups" },
        ...axes.map((a): Col => ({ key: "axis", axisId: a.id, name: a.name })),
        { key: "coverage" },
        ...(bandsActive ? ([{ key: "mfe" }, { key: "maePre" }, { key: "maePost" }, { key: "outcome" }] as Col[]) : []),
    ], [axes, bandsActive]);
    const { displayCols, leftOf, tableW, lastFrozenKey, widthOf } = useMemo(
        () => layoutColumns({ baseCols, frozenCols, hiddenCols, colWidths, containerW, axisMin }),
        [baseCols, frozenCols, hiddenCols, colWidths, containerW, axisMin],
    );

    // ── 우클릭 이상/이하 경계(드래그 선택 보완) — 어느 축 셀에서든 정밀 단일 경계. 배치 해제도 같은 메뉴에서(셀 = 타점×축 하나).
    const [ctx, setCtx] = useState<{ axisId: string; slotId: string; point: RankPoint; rank: number; total: number; x: number; y: number } | null>(null);
    // ── 열 이름 우클릭 = 고정/숨김 + 정렬 체인에서 빼기 메뉴.
    const [hdrCtx, setHdrCtx] = useState<{ key: string; label: string; canHide: boolean; frozen: boolean; sortKey: SortKey; step: number; x: number; y: number } | null>(null);

    const navRow = (row: SheetRow): void => goToPoint({ date: row.date, code: row.stockCode, time: row.time }, "rank-sheet");
    const totalCols = displayCols.length;

    // ── 드래그 배치 — 핀(고정) 행 이름 → 정렬된 축 열. 정렬이 축일 때만 유효(그때만 열이 세로 라인).
    //  · droppable/over 에 의존 안 함(취약) — DndContext 는 droppable 없이도 onDragMove/End 발화, 포인터 좌표만으로 판정.
    const qc = useQueryClient();
    const placeMut = useMutation({
        mutationFn: (v: { axisId: string; point: RankPoint; target: RankTarget }) => placePoint(v.axisId, v.point, v.target),
        onSuccess: () => void qc.invalidateQueries({ queryKey: axisLinesQuery().queryKey }),
    });
    // 배치 해제(셀 우클릭 메뉴) — 배치 보드와 같은 뮤테이션·같은 캐시 키.
    const unplaceMut = useMutation({
        mutationFn: (v: { axisId: string; point: RankPoint }) => unplacePoint(v.axisId, v.point),
        onSuccess: () => void qc.invalidateQueries({ queryKey: axisLinesQuery().queryKey }),
    });
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());     // tbody 행 pk → tr(드롭 Y 판정)
    const sortAxisThRef = useRef<HTMLTableCellElement | null>(null);         // 정렬 축 헤더(열 x 범위)
    const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [dragName, setDragName] = useState<string | null>(null);
    const [drop, setDrop] = useState<SheetDrop | null>(null);

    const computeSheetDrop = (clientX: number, clientY: number): SheetDrop | null => {
        if (!dragAxisId) return null;                       // 축으로 정렬 + 열이 순위 순서일 때만 세로 라인
        const th = sortAxisThRef.current;
        if (!th) return null;
        const cr = th.getBoundingClientRect();
        if (clientX < cr.left || clientX > cr.right) return null; // 정렬 축 열 위에서만
        // DOM 측정만 여기서 — 판정 규칙(타이 ±px·타이그룹 합류·prev/next 방향)은 rankGeometry(순수, 테스트됨).
        const placed: RowGeom[] = [];
        for (const row of mainRows) {
            const cell = row.cells[dragAxisId];
            if (!cell) continue;
            const tr = rowRefs.current.get(pointKey(row));
            if (!tr) continue;
            const rr = tr.getBoundingClientRect();
            placed.push({ slotId: cell.slotId, orderKey: cell.orderKey, top: rr.top, bottom: rr.bottom, centerY: rr.top + rr.height / 2 });
        }
        return { ...computeRowDrop(placed, clientY, primary.dir, (cr.top + cr.bottom) / 2), x0: cr.left, x1: cr.right };
    };

    const onDragStart = (ev: DragStartEvent): void => {
        const pe = ev.activatorEvent as PointerEvent;
        dragStart.current = { x: pe.clientX ?? 0, y: pe.clientY ?? 0 };
        const p = draggedPoint(ev.active.id);
        setDragName(p ? nameOf(p.stockCode) : null);
    };
    const onDragMove = (ev: DragMoveEvent): void => {
        if (!draggedPoint(ev.active.id)) { setDrop(null); return; }
        setDrop(computeSheetDrop(dragStart.current.x + ev.delta.x, dragStart.current.y + ev.delta.y));
    };
    const onDragEnd = (ev: DragEndEvent): void => {
        const point = draggedPoint(ev.active.id);
        if (point && dragAxisId) {
            const d = computeSheetDrop(dragStart.current.x + ev.delta.x, dragStart.current.y + ev.delta.y);
            if (d) placeMut.mutate({ axisId: dragAxisId, point, target: d.target });
        }
        setDrop(null); setDragName(null);
    };

    // 행 핸들러 묶음 — SheetRowView(memo)가 얕은 비교로 재사용하도록 **참조를 고정**한다(useRef 경유,
    // 내용물은 매 렌더 최신 클로저로 갱신 — useChartHotkeys 의 h.current 패턴과 같은 이유).
    const rowHandlersRef = useRef<SheetRowHandlers>({} as SheetRowHandlers);
    rowHandlersRef.current.onNav = navRow;
    rowHandlersRef.current.onHover = setHoveredPoint;
    rowHandlersRef.current.onTogglePin = togglePin;
    rowHandlersRef.current.onCellCtx = (v: CellCtxPayload) => setCtx(v);
    rowHandlersRef.current.registerRef = (key, el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); };
    const rowH = rowHandlersRef.current;

    // 한 행 렌더 — 상태 파생(포커스·호버·핀·흐림·경로통계)만 여기서 계산하고 렌더는 SheetRowView(memo).
    const renderRow = (row: SheetRow, isLastPinned = false, inPinnedBlock = false): JSX.Element => {
        const key = pointKey(row);
        const isPinned = pinnedSet.has(key);
        return (
            <SheetRowView key={key} row={row} cols={displayCols}
                leftOf={leftOf} lastFrozenKey={lastFrozenKey} widthOf={widthOf}
                name={nameOf(row.stockCode)} groups={groupsOf(row)} groupLabel={groupLabel(row)}
                axisCount={axes.length} posBar={posBar} sortAxisId={sortAxisId}
                focus={activeKey === key} hover={hoveredPoint === key} pinned={isPinned}
                dim={bandsActive && !interKeys.has(key) && (isPinned || filterMode === "dim")}
                exc={bandsActive ? excByKey.get(key) : undefined}
                inPinnedBlock={inPinnedBlock} isLastPinned={isLastPinned} h={rowH} />
        );
    };

    if (axesLoading || pointsQ.isLoading) return <Wrap><div style={muted}>불러오는 중…</div></Wrap>;
    if (axes.length === 0) return <Wrap><div style={muted}>축이 없습니다. 배치 보드에서 축을 먼저 만들어 주세요.</div></Wrap>;

    return (
        <Wrap>
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDrop(null); setDragName(null); }}>
            {/* 헤더 컨트롤 — 표시/필터모드/행수(가로 휠 스크롤). 기간은 날짜 필터로 이관. */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", minWidth: 0 }}>
                <div ref={ctrlWheel} className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap: 9, overflowX: "auto", minWidth: 0, flex: 1 }}>
                    <ControlBox label="표시">
                        <TextToggle active={!posBar} onClick={() => setPosBar(false)} title="순위 숫자">숫자</TextToggle>
                        <Dot />
                        <TextToggle active={posBar} onClick={() => setPosBar(true)} title="위치 눈금">눈금</TextToggle>
                    </ControlBox>
                    {bandsActive && (
                        <ControlBox label="필터">
                            <TextToggle active={filterMode === "narrow"} onClick={() => setFilterMode("narrow")} title="매칭만">좁히기</TextToggle>
                            <Dot />
                            <TextToggle active={filterMode === "dim"} onClick={() => setFilterMode("dim")} title="전체 유지·밖은 흐리게">흐리게</TextToggle>
                        </ControlBox>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>{mainRows.length}행{bandsActive ? ` · 매칭 ${interKeys.size}(모수 ${r.coverage})` : ""}{sortAxisId && unplacedOnSort > 0 ? ` · 미배치 ${unplacedOnSort}` : ""}</span>
                    {/* 컷과 2차 정렬이 둘 다 걸리면 축 열이 순위 순서가 아니라 행 사이 드롭이 뜻을 잃는다 — 왜 안 되는지 보이게. */}
                    {dragBroken && <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>· 그룹 안 정렬 중 — 배치 드래그 꺼짐</span>}
                    {sort.length > 1 && <button onClick={() => setSort((s) => [s[0]])} title="2차 이하 정렬 해제(1차만 남김)" style={{ ...miniBtn, flexShrink: 0 }}>정렬 {sort.length}단 ⤺</button>}
                    {cutKeys.length > 0 && <button onClick={() => setCuts((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== `ax:${sortAxisId}`)))} title="이 축의 그룹 컷 모두 해제" style={{ ...miniBtn, flexShrink: 0 }}>그룹 {cutKeys.length + 1} ⤺</button>}
                    {hiddenCols.length > 0 && <button onClick={() => setHiddenCols([])} title="숨긴 열 모두 보이기" style={{ ...miniBtn, flexShrink: 0 }}>숨긴 열 {hiddenCols.length} ⤺</button>}
                    {Object.keys(colWidths).length > 0 && <button onClick={() => setColWidths({})} title="손으로 조절한 열 폭 전부 해제(기본 폭·축 잔여 분배로 복귀)" style={{ ...miniBtn, flexShrink: 0 }}>폭 원위치 ⤺</button>}
                </div>
            </div>

            {/* 표 — 고정폭(table-layout:fixed)·유연 축폭·열 고정(좌측 스택)·핀 행=헤더 블록 상단 고정·날짜 그룹 */}
            <div ref={scrollRef} onScroll={(e) => { sheetScroll = { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }; }} style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                {/* border-collapse: separate — 테두리가 셀에 붙어 sticky(고정 열/헤더/핀)를 따라옴(밑줄·세로선 안 밀림). */}
                <table style={{ tableLayout: "fixed", width: tableW, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
                    <colgroup>{displayCols.map((c) => <col key={colKey(c)} style={{ width: widthOf(c) }} />)}</colgroup>
                    {/* 헤더 블록 = 열 헤더 + 핀 행(둘 다 상단 sticky, 틈·비침 없이 하나로) */}
                    <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--bg-secondary)" }}>
                        <tr style={{ height: ROW_H }}>
                            {displayCols.map((c) => {
                                const sk = sortKeyOf(c);
                                const step = sortStepNo(sort, sk); // 0=미정렬, 1=1차, 2…=2차 이하
                                const active = step > 0;
                                const left = leftOf.get(colKey(c));
                                const justify = COL_META[c.key].justify;
                                // 드래그 재정렬 두 종류 — **고정 여부로 갈린다**(순서 소스가 둘이기 때문).
                                //   고정 열  = 시트 전용 자리 → frozenCols 배열만 재배치(배치 보드 무관)
                                //   비고정 축 = 축 서열 그 자체 → reorderAxis(배치 보드 레인 순서도 따라온다)
                                // 종목 열은 언제나 맨 앞 붙박이라 어느 쪽도 아니다.
                                const frozenHere = c.key !== "name" && frozenSet.has(colKey(c));
                                const dnd = frozenHere ? {
                                    draggable: true,
                                    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(COL_DND, colKey(c)); e.dataTransfer.effectAllowed = "move"; },
                                    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(COL_DND)) e.preventDefault(); },
                                    onDrop: (e: React.DragEvent) => { const k = e.dataTransfer.getData(COL_DND); if (k) reorderFrozen(k, colKey(c)); },
                                } : c.key === "axis" ? {
                                    draggable: true,
                                    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(AXIS_DND, (c as { axisId: string }).axisId); e.dataTransfer.effectAllowed = "move"; },
                                    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(AXIS_DND)) e.preventDefault(); },
                                    onDrop: (e: React.DragEvent) => { const id = e.dataTransfer.getData(AXIS_DND); if (id) reorderAxis(id, (c as { axisId: string }).axisId); },
                                } : {};
                                return (
                                    <th key={colKey(c)} {...dnd} title={`${colLabel(c)} — 클릭=이 열로 정렬 · Shift+클릭=정렬 단 추가`}
                                        ref={c.key === "axis" && c.axisId === sortAxisId ? sortAxisThRef : undefined}
                                        onClick={(e) => clickHeader(sk, e.shiftKey)}
                                        onContextMenu={(e) => { e.preventDefault(); setHdrCtx({ key: colKey(c), label: colLabel(c), canHide: c.key !== "name", frozen: c.key === "name" || frozenSet.has(colKey(c)), sortKey: sk, step, x: e.clientX, y: e.clientY }); }}
                                        style={{ ...thBase, position: "relative", cursor: "pointer", color: step === 1 ? "var(--accent-primary)" : active ? "var(--text-secondary)" : "var(--text-tertiary)", ...(colKey(c) === lastFrozenKey ? { borderRight: "2px solid var(--border-strong)" } : {}), ...(left != null ? { position: "sticky", left, zIndex: 6, background: "var(--bg-secondary)" } : {}) }}>
                                        <span style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: 2, minWidth: 0 }}>
                                            {active && <span style={{ flexShrink: 0 }}>{sort[step - 1].dir === 1 ? "▲" : "▼"}</span>}
                                            {/* 단 번호는 체인이 2단 이상일 때만 — 기본 화면(1단)은 지금과 똑같이 보인다. */}
                                            {active && sort.length > 1 && <span style={{ flexShrink: 0, fontSize: 8.5, opacity: 0.8, marginRight: 1 }}>{step}</span>}
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colLabel(c)}</span>
                                        </span>
                                        <ResizeHandle width={widthOf(c)} onResize={(w) => setColWidths((m) => ({ ...m, [colKey(c)]: w }))} />
                                    </th>
                                );
                            })}
                        </tr>
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
                {bandsActive && r.isLoading && <div style={muted}>경로 산정 중…</div>}
                {pinnedRows.length === 0 && mainRows.length === 0 && <div style={muted}>{bandsActive ? "이 조건에 맞는 타점이 없습니다." : "이 기간에 타점이 없습니다."}</div>}
            </div>

            <DragOverlay dropAnimation={null}>
                {dragName && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 4, background: "var(--bg-tertiary)", border: "1px solid var(--accent-primary)", boxShadow: "0 6px 18px rgba(0,0,0,0.28)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{dragName}</span>}
            </DragOverlay>
          </DndContext>

          {drop && createPortal(
            drop.tie && drop.rowTop != null && drop.rowBottom != null
                ? <div style={{ position: "fixed", left: drop.x0, top: drop.rowTop, width: drop.x1 - drop.x0, height: drop.rowBottom - drop.rowTop, border: "2px solid var(--accent-primary)", borderRadius: 4, pointerEvents: "none", zIndex: 70, boxSizing: "border-box" }} />
                : <div style={{ position: "fixed", left: drop.x0, top: drop.y - 1, width: drop.x1 - drop.x0, height: 2, background: "var(--accent-primary)", boxShadow: "0 0 0 1px var(--bg-primary)", pointerEvents: "none", zIndex: 70 }} />,
            document.body,
          )}

            {/* 셀 우클릭 — 배치 편집만 남았다(밴드·값경계는 필터 패널로 이사). 계산 축은 배치가 없어 메뉴도 없다. */}
            {ctx && !isComputedAxis(ctx.axisId) && (() => {
                const ax = axes.find((a) => a.id === ctx.axisId);
                if (!ax) return null;
                const cutOn = (cuts[`ax:${ctx.axisId}`] ?? []).includes(ctx.slotId);
                const cutEnabled = sortAxisId === ctx.axisId; // 1차 정렬 축에서만 — 안 보이는 줄엔 선을 못 긋는다
                return (
                    <AnchoredPopover anchor={ctx} onClose={() => setCtx(null)} minWidth={180} padding={0} placement="beside" offset={6}>
                        <MenuLabel>{ax.name} · {ctx.rank}/{ctx.total}위</MenuLabel>
                        {cutEnabled && (
                            <MenuItem onClick={() => { toggleCut(ctx.axisId, ctx.slotId); setCtx(null); }}>
                                {cutOn ? "그룹 나누기 해제" : "여기서 그룹 나누기"}
                            </MenuItem>
                        )}
                        <MenuItem onClick={() => { unplaceMut.mutate({ axisId: ctx.axisId, point: ctx.point }); setCtx(null); }}>
                            이 축에서 배치 해제
                        </MenuItem>
                    </AnchoredPopover>
                );
            })()}

            {hdrCtx && (
                <HeaderMenu anchor={hdrCtx} label={hdrCtx.label} frozen={hdrCtx.frozen} canHide={hdrCtx.canHide} canFreeze={hdrCtx.key !== "name"}
                    sortStep={sort.length > 1 ? hdrCtx.step : 0}
                    onToggleFreeze={() => { toggleFrozen(hdrCtx.key); setHdrCtx(null); }}
                    onHide={() => { toggleHidden(hdrCtx.key); setHdrCtx(null); }}
                    onDropSort={() => { setSort((s) => dropSort(s, hdrCtx.sortKey)); setHdrCtx(null); }}
                    onClose={() => setHdrCtx(null)} />
            )}
        </Wrap>
    );
}

// 열 이름 우클릭 메뉴 — 왼쪽 고정/해제 · 숨기기 · 정렬 체인에서 빼기.
//  정렬 빼기가 여기 있는 이유: Shift+클릭은 방향 토글이라 뺄 손짓이 없다. 체인이 2단 이상일 때만 뜬다.
function HeaderMenu({ anchor, label, frozen, canHide, canFreeze, sortStep, onToggleFreeze, onHide, onDropSort, onClose }: {
    anchor: { x: number; y: number }; label: string; frozen: boolean; canHide: boolean; canFreeze: boolean;
    /** 이 열의 정렬 단(1부터). 0 = 체인에 없거나 1단짜리 정렬 → 항목 숨김. */
    sortStep: number;
    onToggleFreeze: () => void; onHide: () => void; onDropSort: () => void; onClose: () => void;
}): JSX.Element {
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={168} padding={0} placement="beside" offset={6}>
            <MenuLabel>{label}</MenuLabel>
            {sortStep > 0 && <MenuItem onClick={onDropSort}>{sortStep}차 정렬에서 빼기</MenuItem>}
            {canFreeze && <MenuItem onClick={onToggleFreeze} style={sortStep > 0 ? { borderTop: "1px solid var(--border-subtle)" } : undefined}>{frozen ? "🔓 고정 해제" : "🔒 왼쪽 고정"}</MenuItem>}
            {canHide && (
                <MenuItem onClick={onHide} style={{ borderTop: canFreeze ? "1px solid var(--border-subtle)" : undefined, color: "var(--text-secondary)" }}>
                    이 열 숨기기
                </MenuItem>
            )}
        </AnchoredPopover>
    );
}

// 열 폭 손잡이 — 헤더 오른쪽 가장자리 5px. 여기서 드래그 이벤트를 끊는 게 핵심이다:
// th 는 이미 draggable(열 재정렬)이라 가장자리를 잡아도 열이 옮겨져 버린다(폭 조절이 아예 안 먹는다).
// 포인터 캡처로 창 밖까지 따라오고, 클릭이 헤더 정렬 토글로 새지 않게 클릭/업에서도 전파를 막는다.
function ResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }): JSX.Element {
    const start = useRef<{ x: number; w: number } | null>(null);
    return (
        <span
            draggable={false}
            onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); start.current = { x: e.clientX, w: width }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { const s = start.current; if (s) onResize(Math.max(MIN_COL_W, Math.round(s.w + (e.clientX - s.x)))); }}
            onPointerUp={(e) => { start.current = null; e.currentTarget.releasePointerCapture(e.pointerId); e.stopPropagation(); }}
            title="드래그 = 열 폭 조절"
            style={{ position: "absolute", top: 0, right: 0, width: 5, height: "100%", cursor: "col-resize", touchAction: "none", zIndex: 1 }}
        />
    );
}

const Wrap = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>{children}</div>
);
const muted: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "16px 12px" };
// userSelect none — Shift+클릭(정렬 단 추가)이 헤더 글자를 범위 선택해 파랗게 물들이는 걸 막는다.
const thBase: CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: "6px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap", userSelect: "none" };
const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer" };
