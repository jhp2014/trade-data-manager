import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable,
    type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { axisLinesQuery, allPointsQuery } from "../api/queries.js";
import { placePoint, unplacePoint, type RankPoint, type RankTarget } from "../api/rank.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { buildSheetRows, type SheetRow } from "./rank/rankSheet.js";
import { COL_META, MIN_COL_W, colKey, colLabel, layoutColumns, pruneAxisKeys, reorderFrozenCols, type Col, type ColKind } from "./rank/sheetColumns.js";
import {
    DEFAULT_CHAIN, buildSheetGroups, cutsActive, dropSort, parseSortChain, pushSort, resetSort, resolveCutKeys,
    sortKeyOf, sortSheetRows, sortStepNo, type SortChain, type SortCtx, type SortKey,
} from "./rank/sheetSort.js";
import { buildAxisIndex, slotOrderKeys, type AxisIndex, type RankCell } from "../lib/rankIndex.js";
import { useRankAxes } from "../lib/useRankAxes.js";
import { isComputedAxis, formatAxisValue } from "../lib/computedAxis.js";
import { computeRowDrop, type RowGeom } from "./rank/rankGeometry.js";
import { SavedFilterControls } from "./rank/SavedFilterControls.js";
import { TagFilterLine, AddTagFilterButton } from "./rank/TagFilterLine.js";
import { RankFilterBar } from "./rank/RankFilterBar.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { AxisBoundMenu } from "./rank/AxisBoundMenu.js";
import { ComputedBoundMenu } from "./rank/ComputedBoundMenu.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { useTags } from "../lib/useTags.js";
import { TagChips } from "../components/TagChips.js";
import { TagMenu } from "../chart/TagMenu.js";
import { pointKey, pointKeyOf, parsePointKey } from "../lib/pointKey.js";
import { usePersistedState } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";
import type { Excursion } from "./rank/pathStats.js";
import { FAIL, FILTER, PIN as PIN_COLOR, STRONG, WEAK, heatOf } from "../styles/palette.js";

// 타점 분석 시트 — 행=타점 · 열=축별 순위 + 결과. 배치 현황과 결과 목록을 한 표로 통합.
//  · 셀 = 그 축 순위 `rank/total`(기본) 또는 위치 바(토글). 미배치 = 빈칸.
//  · 헤더 클릭 = 그 열로 정렬(축은 강 먼저) · **Shift+클릭 = 정렬 단 추가**(n차). 정렬 축에서 행범위
//    **드래그 선택 = 밴드**(AND drill-down, rankBands 공유). 체인·그룹 규칙은 sheetSort(순수·테스트)에.
//  · **그룹**: 1차 키에서만 접는다. 날짜·결과·태그·배치수처럼 값이 몇 가지뿐인 열은 저절로, 축처럼 값이 거의
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
//  · 태그 셀 우클릭 = 차트와 같은 TagMenu(붙이기·떼기·새 태그·슬롯) — 시트에서 결과를 보다 바로 태그를 고칠 수 있게.

const POS_MODE_KEY = "wb.rankSheetPosMode";
const FROZEN_KEY = "wb.rankSheetFrozenCols";
const HIDDEN_KEY = "wb.rankSheetHiddenCols";
const WIDTHS_KEY = "wb.rankSheetColWidths";
const FILTERMODE_KEY = "wb.rankSheetFilterMode";
const SORT_KEY = "wb.rankSheetSort"; // 정렬 체인 영속(다른 시트 설정과 동일 패턴) — 프리셋 전환·새로고침에 유지. 옛 단일 정렬도 읽는다.
const CUTS_KEY = "wb.rankSheetCuts";  // 축 열 그룹 컷 — colKey(`ax:<id>`) → slotId[]. 시트 전용(축의 속성 아님)이라 로컬.
// 스크롤 위치는 세션 한정(모듈 메모) — 프리셋 전환(재마운트)엔 이어지고 새로고침엔 초기화(목록 중간 튐 방지).
let sheetScroll = { top: 0, left: 0 };
const PIN = PIN_COLOR;
// 열 헤더 드래그의 두 종류 — 미디어타입으로 갈라 서로의 드롭을 안 받는다(고정 그룹 재정렬 vs 축 서열 변경).
const AXIS_DND = "application/x-rank-axis";
const COL_DND = "application/x-rank-col";
const ROW_H = 30; // 모든 행 고정 높이 → 핀 sticky top 오프셋을 정확히 계산.

function outcomeColor(v?: string): string {
    if (!v) return "var(--text-tertiary)";
    if (/성공|승|익절|win|good/i.test(v)) return STRONG;
    if (/실패|패|손절|loss|bad/i.test(v)) return FAIL;
    return "var(--text-secondary)";
}

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

    const rankBands = useWorkbench((s) => s.rankBands);
    const setRankBound = useWorkbench((s) => s.setRankBound);
    const clearRankBand = useWorkbench((s) => s.clearRankBand);
    const axisValueRanges = useWorkbench((s) => s.axisValueRanges);
    const setAxisValueBound = useWorkbench((s) => s.setAxisValueBound);
    const setAxisValueRanges = useWorkbench((s) => s.setAxisValueRanges);

    // ── 링크 공유 상태(배치 보드와 양방향) — 호버·핀·축순서.
    const hoveredPoint = useWorkbench((s) => s.hoveredPoint);
    const setHoveredPoint = useWorkbench((s) => s.setHoveredPoint);
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    // ── 축 + 라인(배치 보드와 공유) → 순위 인덱스. 열 재정렬도 같은 store 순서를 만진다.
    // 계산 축을 함께 본다 — 판단 축과 같은 줄 모양으로 합쳐져 열·정렬·순위 셀이 구분 없이 동작한다.
    // 다만 **읽기 전용**: 배치/해제·밴드·컷은 계산 축 열에서 열리지 않는다(아래 isComputedAxis 가드).
    const { axes, axisIds, linesByAxis, computedValues, computedMeta, isLoading: axesLoading, reorder: reorderAxis } = useRankAxes({ includeComputed: true });
    const indexByAxis = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        for (const [axisId, placed] of linesByAxis) m.set(axisId, buildAxisIndex(placed));
        return m;
    }, [linesByAxis]);

    // ── 태그(부착 피드 한 벌 — 차트·타점 정보 패널과 같은 캐시). 시트는 조회만 하고 편집은 차트 ▼ 우클릭에서.
    const { tagsOf } = useTags();
    const tagLabel = (row: { stockCode: string; date: string; time: string }): string => tagsOf(row).map((t) => t.name).join(", ");

    // ── 전체 타점(행 원천) + 기간.
    const pointsQ = useQuery(allPointsQuery());
    const allPoints = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);
    const allByKey = useMemo(() => {
        const m = new Map<string, ReviewPointListItem>();
        for (const p of allPoints) m.set(pointKey(p), p);
        return m;
    }, [allPoints]);
    const dateBounds = useMemo(() => { const ds = allPoints.map((p) => p.date).sort(); return ds.length ? { min: ds[0], max: ds[ds.length - 1] } : null; }, [allPoints]);

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
        tagLabel,
        excursionOf: (row) => excByKey.get(pointKey(row)),
    }), [r.nameOf, tagsOf, excByKey]); // eslint-disable-line react-hooks/exhaustive-deps -- tagLabel 은 tagsOf 파생
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
        { key: "name" }, { key: "date" }, { key: "time" }, { key: "tags" },
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
    // ── 태그 셀 우클릭 = 태그 입력(차트 타점 ▼ 우클릭과 같은 TagMenu — 사전·슬롯·부착이 한 벌).
    const [tagCtx, setTagCtx] = useState<{ point: RankPoint; label: string; x: number; y: number } | null>(null);
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

    // 한 행 렌더. inPinnedBlock = 상단 고정 블록(thead)의 복사본. isLastPinned → 그 블록 하단 구분선.
    //  원래 위치(tbody)의 핀 행은 inPinnedBlock=false → 일반 행처럼 하단 구분선을 가진다(아래 행과 안 이어지게).
    const renderRow = (row: SheetRow, isLastPinned = false, inPinnedBlock = false): JSX.Element => {
        const key = pointKey(row);
        const focus = activeKey === key;
        const isHover = hoveredPoint === key;
        const isPinned = pinnedSet.has(key);
        // 핀 행은 필터가 좁혀도 안 사라짐(작업셋). 밴드 안 맞으면 흐리게로 표시(핀은 모드 무관).
        const dim = bandsActive && !interKeys.has(key) && (isPinned || filterMode === "dim");
        const e = bandsActive ? excByKey.get(key) : undefined;
        // 배경 — 핀 행도 일반 행처럼 배경 없음(불투명 bg-primary로 sticky 비침만 방지). 좌측 바·하단 구분선으로 구분.
        const rowBg = focus ? "var(--accent-soft)" : isHover ? "var(--bg-secondary)" : isPinned ? "var(--bg-primary)" : "transparent";
        const cellBgOpaque = focus ? "var(--accent-soft)" : isHover ? "var(--bg-secondary)" : "var(--bg-primary)";
        // 행 구분선(셀에, separate 모드) — 고정 블록 안에서만 마지막만(블록 통합), 그 외(tbody 핀 포함)는 매 행.
        const rowBorder = inPinnedBlock ? (isLastPinned ? "2px solid var(--border-strong)" : "none") : "1px solid var(--border-subtle)";
        const stick = (c: Col): CSSProperties => {
            const left = leftOf.get(colKey(c));
            const s: CSSProperties = { borderBottom: rowBorder };
            if (left != null) { s.position = "sticky"; s.left = left; s.zIndex = 2; s.background = cellBgOpaque; }
            if (colKey(c) === lastFrozenKey) s.borderRight = "2px solid var(--border-strong)";
            return s;
        };
        // 셀 렌더 — 열 종류를 키로 찾는다(if 체인 대신). td 껍데기(공통 스타일·sticky)는 여기서 한 번 씌우고,
        // 종류별 함수는 **안쪽 내용과 그 열만의 style/이벤트**만 돌려준다. 열을 붙이면 여기 항목 하나 + COL_META 한 줄.
        const cellFor = (c: Col): JSX.Element => {
            const r = CELLS[c.key](c);
            return (
                <td key={colKey(c)} onClick={r.onClick} onContextMenu={r.onContextMenu} title={r.title}
                    style={{ ...COL_META[c.key].td, ...r.style, ...stick(c) }}>
                    {r.body}
                </td>
            );
        };
        type CellRender = { body: ReactNode; style?: CSSProperties; onClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void; title?: string };
        const CELLS: Record<ColKind, (c: Col) => CellRender> = {
            name: () => ({
                style: { fontWeight: 600, whiteSpace: "nowrap", position: "relative", borderLeft: `3px solid ${focus ? "var(--accent-primary)" : "transparent"}` },
                body: (
                    <>
                        {inPinnedBlock
                            ? <PinnedDragName pkStr={key} name={nameOf(row.stockCode)} focus={focus} onNav={() => navRow(row)} />
                            : <span onClick={() => navRow(row)} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: focus ? "var(--accent-primary)" : undefined }}>{nameOf(row.stockCode)}</span>}
                        {(isHover || isPinned) && (
                            <button onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); togglePin(key); }} title={isPinned ? "핀 해제(▼)" : "핀 고정(▲)"}
                                style={{ position: "absolute", right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", padding: "0 4px 0 8px", border: "none", cursor: "pointer", color: isPinned ? PIN : "var(--text-secondary)", fontSize: 12, lineHeight: 1, background: `linear-gradient(90deg, transparent, ${cellBgOpaque} 40%)` }}>{isPinned ? "▼" : "▲"}</button>
                        )}
                    </>
                ),
            }),
            date: () => ({
                onClick: () => navRow(row),
                style: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "center", cursor: "pointer", fontSize: 11, color: "var(--text-secondary)" },
                body: row.date.slice(2).replace(/-/g, "."),
            }),
            time: () => ({
                onClick: () => navRow(row),
                style: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "center", cursor: "pointer", fontWeight: 600, color: "var(--accent-primary)" },
                body: row.time.slice(0, 5),
            }),
            axis: (c) => {
                const axisId = (c as { axisId: string }).axisId;
                const cell = row.cells[axisId];
                const frozen = leftOf.has(colKey(c));
                return {
                    onClick: () => navRow(row),
                    // 우클릭 메뉴는 축 종류에 따라 갈린다(아래 ctx 렌더): 판단 축=slot 밴드+컷+배치해제,
                    // 계산 축=값 경계(타점 앵커). 계산 축에 배치·컷이 없는 건 slot 이 없어서지 읽기 전용이라서가 아니다.
                    onContextMenu: cell ? (ev) => { ev.preventDefault(); setCtx({ axisId, slotId: cell.slotId, point: { stockCode: row.stockCode, date: row.date, time: row.time }, rank: cell.rank, total: cell.total, x: ev.clientX, y: ev.clientY }); } : undefined,
                    title: isComputedAxis(axisId) ? "계산 축(수식) — 우클릭 = 이 값 이상/이하 · 클릭 = 이동" : "우클릭 = 이상/이하 밴드 · 그룹 나누기 · 배치 해제 · 클릭 = 이동",
                    style: { cursor: "pointer", background: frozen ? cellBgOpaque : sortAxisId === axisId ? "var(--bg-secondary)" : "transparent" },
                    body: <Cell cell={cell} posBar={posBar} prominent={focus} barWidth={widthOf(c) - 18} />,
                };
            },
            // 태그 — 폭이 모자라면 **그냥 잘린다**(wrap·스크롤 없음). 더 보고 싶으면 열 폭을 늘리는 게 이 표의 규칙.
            //   좁은 열이라 그룹 prefix 는 뗀다(색이 이미 그룹을 말한다). 전체 이름은 셀 툴팁에.
            tags: () => ({
                onClick: () => navRow(row),
                onContextMenu: (ev) => {
                    ev.preventDefault();
                    setTagCtx({ point: { stockCode: row.stockCode, date: row.date, time: row.time }, label: `${nameOf(row.stockCode)} · ${row.date.slice(5)} ${row.time.slice(0, 5)}`, x: ev.clientX, y: ev.clientY });
                },
                style: { cursor: "pointer", overflow: "hidden" },
                title: `${tagLabel(row) || "태그 없음"} — 우클릭 = 태그 입력`,
                body: <TagChips tags={tagsOf(row)} short style={{ justifyContent: "center" }} />,
            }),
            coverage: () => ({
                style: { color: row.coverage === axes.length ? STRONG : "var(--text-secondary)" },
                body: `${row.coverage}/${axes.length}`,
            }),
            outcome: () => ({
                body: row.outcome ? <span style={{ fontSize: 11, color: outcomeColor(row.outcome) }}>{row.outcome}</span> : null,
            }),
            mfe: () => excursionCell("mfe"),
            maePre: () => excursionCell("maePre"),
            maePost: () => excursionCell("maePost"),
        };
        // MFE/MAE 3열은 부호·색만 다른 같은 셀 — 경로 통계(excByKey)가 없으면 "—".
        function excursionCell(field: "mfe" | "maePre" | "maePost"): CellRender {
            const v = e ? e[field] : null;
            return { style: { color: field === "mfe" ? STRONG : WEAK }, body: v == null ? "—" : (field === "mfe" ? "+" : "") + v.toFixed(1) };
        }
        return (
            <tr key={key} onMouseEnter={() => setHoveredPoint(key)} onMouseLeave={() => setHoveredPoint(null)}
                ref={inPinnedBlock ? undefined : (el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); }}
                style={{ background: rowBg, opacity: dim ? 0.38 : 1, height: ROW_H }}>
                {displayCols.map(cellFor)}
            </tr>
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
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, flexShrink: 0 }}>
                    <SavedFilterControls axes={axes} />
                </span>
            </div>

            <RankFilterBar axes={axes} dateBounds={dateBounds} computedValues={computedValues} computedMeta={computedMeta} extra={<AddTagFilterButton />} />
            <TagFilterLine />

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
                                // 필터 걸린 축 표시 — 판단 축은 밴드, 계산 축은 값 구간(저장 자리만 다르고 뜻은 같다).
                                const banded = c.key === "axis" && (!!rankBands[c.axisId] || !!axisValueRanges[c.axisId]);
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
                                        style={{ ...thBase, position: "relative", cursor: "pointer", color: step === 1 ? "var(--accent-primary)" : active ? "var(--text-secondary)" : banded ? FILTER : "var(--text-tertiary)", borderBottom: banded ? `2px solid ${FILTER}` : thBase.borderBottom, ...(colKey(c) === lastFrozenKey ? { borderRight: "2px solid var(--border-strong)" } : {}), ...(left != null ? { position: "sticky", left, zIndex: 6, background: "var(--bg-secondary)" } : {}) }}>
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

            {ctx && (() => {
                const ax = axes.find((a) => a.id === ctx.axisId);
                if (!ax) return null;
                if (isComputedAxis(ctx.axisId)) {
                    // 계산 축 = 값 경계(타점 앵커). 판단 축의 slot 밴드와 저장 자리가 달라 메뉴도 따로.
                    const pk = pointKey(ctx.point);
                    const v = computedValues.get(ctx.axisId)?.get(pk);
                    return (
                        <ComputedBoundMenu anchor={ctx} axisName={ax.name} pointKey={pk}
                            valueText={v === undefined ? "?" : (computedMeta.get(ctx.axisId)?.fmt ?? formatAxisValue)(v)}
                            rank={{ rank: ctx.rank, total: ctx.total }}
                            ranges={axisValueRanges[ctx.axisId] ?? []}
                            onSet={(edge) => { setAxisValueBound(ctx.axisId, edge, { kind: "point", point: pk }); setCtx(null); }}
                            onClear={() => { setAxisValueRanges(ctx.axisId, []); setCtx(null); }}
                            onClose={() => setCtx(null)} />
                    );
                }
                return (
                    <AxisBoundMenu anchor={ctx} axisName={ax.name} band={rankBands[ctx.axisId]} slotId={ctx.slotId}
                        rank={{ rank: ctx.rank, total: ctx.total }}
                        onSet={(edge) => { setRankBound(ctx.axisId, edge, ctx.slotId); setCtx(null); }}
                        onClear={() => { clearRankBand(ctx.axisId); setCtx(null); }}
                        onUnplace={() => { unplaceMut.mutate({ axisId: ctx.axisId, point: ctx.point }); setCtx(null); }}
                        cut={{
                            on: (cuts[`ax:${ctx.axisId}`] ?? []).includes(ctx.slotId),
                            enabled: sortAxisId === ctx.axisId, // 1차 정렬 축에서만 — 안 보이는 줄엔 선을 못 긋는다
                            onToggle: () => { toggleCut(ctx.axisId, ctx.slotId); setCtx(null); },
                        }}
                        onClose={() => setCtx(null)} />
                );
            })()}

            {tagCtx && <TagMenu anchor={tagCtx} point={tagCtx.point} label={tagCtx.label} onClose={() => setTagCtx(null)} />}

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

// 핀(고정) 행 이름 = 드래그 소스(chip:{pk}). 정렬 축 열에 드롭해 배치. 그냥 클릭=이동(dnd distance 4 로 클릭/드래그 자동 구분).
function PinnedDragName({ pkStr, name, focus, onNav }: { pkStr: string; name: string; focus: boolean; onNav: () => void }): JSX.Element {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${pkStr}` });
    return (
        <span ref={setNodeRef} {...listeners} {...attributes} onClick={onNav} title={`${name} — 드래그해 정렬 축에 배치 · 클릭=이동`}
            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "grab", touchAction: "none", opacity: isDragging ? 0.4 : 1, color: focus ? "var(--accent-primary)" : undefined }}>{name}</span>
    );
}

// 열 이름 우클릭 메뉴 — 왼쪽 고정/해제 · 숨기기 · 정렬 체인에서 빼기. (경계 메뉴는 배치 보드와 공용 AxisBoundMenu.)
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

// ── 순위 셀(숫자 `rank/total` 또는 위치 눈금 틱). 미배치 = 흐린 점. prominent(선택 행) = 불릿처럼 굵게.
function Cell({ cell, posBar, prominent, barWidth }: { cell: RankCell | null; posBar: boolean; prominent?: boolean; barWidth?: number }): JSX.Element {
    if (!cell) return <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>;
    if (!posBar) return <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{cell.rank}<span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>/{cell.total}</span></span>;
    // 눈금 틱: 얇은 선 + 세로 틱(색=위치 히트). 폭 = 넓어진 축 열 활용. 선택 행은 굵은 불릿으로 선명.
    const col = heatOf(cell.frac);
    return (
        <span style={{ position: "relative", display: "inline-block", width: Math.max(36, barWidth ?? 40), height: 14, verticalAlign: "middle" }} title={`${cell.rank}/${cell.total}`}>
            <span style={{ position: "absolute", left: 1, right: 1, top: "50%", height: prominent ? 2 : 1, background: prominent ? "var(--text-tertiary)" : "var(--border-strong)", transform: "translateY(-50%)", borderRadius: 1 }} />
            <span style={{ position: "absolute", top: "50%", left: `calc(3px + ${cell.frac} * (100% - 6px))`, width: prominent ? 5 : 3, height: prominent ? 13 : 10, background: col, transform: "translate(-50%,-50%)", borderRadius: 2, boxShadow: prominent ? "0 0 0 1.5px var(--bg-primary)" : undefined }} />
        </span>
    );
}


const Wrap = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>{children}</div>
);
const muted: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "16px 12px" };
// userSelect none — Shift+클릭(정렬 단 추가)이 헤더 글자를 범위 선택해 파랗게 물들이는 걸 막는다.
const thBase: CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: "6px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap", userSelect: "none" };
const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer" };
