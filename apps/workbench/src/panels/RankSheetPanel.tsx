import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable,
    type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { axisLinesQuery, allPointsQuery } from "../api/queries.js";
import { placePoint, type RankPoint, type RankTarget } from "../api/rank.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { buildSheetRows, type SheetRow } from "./rank/rankSheet.js";
import { COL_META, MIN_COL_W, colKey, colLabel, layoutColumns, pruneAxisKeys, reorderFrozenCols, type Col, type ColKind } from "./rank/sheetColumns.js";
import { buildAxisIndex, type AxisIndex, type RankCell } from "../lib/rankIndex.js";
import { useRankAxes } from "../lib/useRankAxes.js";
import { computeRowDrop, type RowGeom } from "./rank/rankGeometry.js";
import { SavedFilterControls } from "./rank/SavedFilterControls.js";
import { TagFilterLine, AddTagFilterButton } from "./rank/TagFilterLine.js";
import { RankFilterBar } from "./rank/RankFilterBar.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { AxisBoundMenu } from "./rank/AxisBoundMenu.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { useTags } from "../lib/useTags.js";
import { TagChips } from "../components/TagChips.js";
import { pointKey, pointKeyOf, parsePointKey } from "../lib/pointKey.js";
import { loadJson, saveJson } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";
import type { Excursion } from "./rank/pathStats.js";
import { FAIL, FILTER, PIN as PIN_COLOR, STRONG, WEAK, heatOf } from "../styles/palette.js";

// 타점 분석 시트 — 행=타점 · 열=축별 순위 + 결과. 배치 현황과 결과 목록을 한 표로 통합.
//  · 셀 = 그 축 순위 `rank/total`(기본) 또는 위치 바(토글). 미배치 = 빈칸.
//  · 축 헤더 클릭 = 그 축 강도 정렬(강 먼저). 정렬 축에서 행범위 **드래그 선택 = 밴드**(AND drill-down, rankBands 공유).
//  · 밴드 활성 시 행=교집합, 결과 열(MFE/MAE/결과)이 lazy 로 붙는다(좁혔을 때만 경로 fetch). 미배치는 strict AND 로 탈락.
//  · 기간(전체/월)은 독립 필터. **비고정** 축 열의 드래그 재정렬은 배치 보드와 양방향 동기화(store rankAxisOrder).
//    고정한 열은 시트 전용 자리 — 고정 그룹 안에서만 순서를 바꾸고 배치 보드는 안 건드린다(순서 소스가 둘이라 규칙을 갈랐다).
//  · 열 폭은 손으로 조절 가능(헤더 오른쪽 가장자리 드래그). **수동 폭을 준 열만 고정폭**이 되고, 안 준 축 열들은
//    지금처럼 남는 폭을 나눠 갖는다 → "폭 원위치"(수동 폭 삭제)면 기본 동작으로 정확히 복귀한다.
//  · 링크: 드래그=소프트 선택(색만, 안 좁힘, 누적) · 우클릭=밴드(좁힘) · 선택/호버는 배치 보드와 공유(색으로 표시).

const POS_MODE_KEY = "wb.rankSheetPosMode";
const FROZEN_KEY = "wb.rankSheetFrozenCols";
const HIDDEN_KEY = "wb.rankSheetHiddenCols";
const WIDTHS_KEY = "wb.rankSheetColWidths";
const FILTERMODE_KEY = "wb.rankSheetFilterMode";
const SORT_KEY = "wb.rankSheetSort"; // 정렬 기준 영속(다른 시트 설정과 동일 패턴) — 프리셋 전환·새로고침에 유지.
// 스크롤 위치는 세션 한정(모듈 메모) — 프리셋 전환(재마운트)엔 이어지고 새로고침엔 초기화(목록 중간 튐 방지).
let sheetScroll = { top: 0, left: 0 };
const PIN = PIN_COLOR;
// 열 헤더 드래그의 두 종류 — 미디어타입으로 갈라 서로의 드롭을 안 받는다(고정 그룹 재정렬 vs 축 서열 변경).
const AXIS_DND = "application/x-rank-axis";
const COL_DND = "application/x-rank-col";
const ROW_H = 30; // 모든 행 고정 높이 → 핀 sticky top 오프셋을 정확히 계산.

/** 열 → 그 열로 정렬할 때의 키. axis 만 축 id 를 실어야 해서 분기 하나. */
const sortKeyOf = (c: Col): SortKey => (c.key === "axis" ? { kind: "axis", axisId: c.axisId } : { kind: c.key });

type SortKey =
    | { kind: "name" }
    | { kind: "date" }
    | { kind: "time" }
    | { kind: "coverage" }
    | { kind: "tags" }
    | { kind: "axis"; axisId: string }
    | { kind: "mfe" | "maePre" | "maePost" | "outcome" };
type Sort = { key: SortKey; dir: 1 | -1 };

const sameSort = (a: SortKey, b: SortKey): boolean => (a.kind === "axis" && b.kind === "axis" ? a.axisId === b.axisId : a.kind === b.kind);
const SORT_KINDS = ["name", "date", "time", "tags", "coverage", "mfe", "maePre", "maePost", "outcome", "axis"];
// 영속된 정렬 복원 검증 — 형태 안 맞으면 null(기본값 폴백). axis 는 axisId 문자열 필수(없어진 축이어도 무해: 전부 미배치 취급).
function parseSort(o: unknown): Sort | null {
    if (!o || typeof o !== "object") return null;
    const s = o as { key?: { kind?: unknown; axisId?: unknown }; dir?: unknown };
    if (s.dir !== 1 && s.dir !== -1) return null;
    const k = s.key;
    if (!k || typeof k.kind !== "string" || !SORT_KINDS.includes(k.kind)) return null;
    if (k.kind === "axis" && typeof k.axisId !== "string") return null;
    return s as Sort;
}

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

    // ── 링크 공유 상태(배치 보드와 양방향) — 호버·핀·축순서.
    const hoveredPoint = useWorkbench((s) => s.hoveredPoint);
    const setHoveredPoint = useWorkbench((s) => s.setHoveredPoint);
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    // ── 축 + 라인(배치 보드와 공유) → 순위 인덱스. 열 재정렬도 같은 store 순서를 만진다.
    const { axes, axisIds, linesByAxis, isLoading: axesLoading, reorder: reorderAxis } = useRankAxes();
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
    const [filterMode, setFilterMode] = useState<"narrow" | "dim">(() => (loadJson(FILTERMODE_KEY, (o) => (o === "dim" ? "dim" : o === "narrow" ? "narrow" : null)) ?? "narrow"));
    useEffect(() => saveJson(FILTERMODE_KEY, filterMode), [filterMode]);

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

    // ── 정렬. 축 정렬 = 강(rank↑) 먼저, 미배치는 방향 무관 맨 아래로 가라앉힘. localStorage 영속(프리셋 전환·새로고침 유지).
    const [sort, setSort] = useState<Sort>(() => parseSort(loadJson(SORT_KEY, (o) => o)) ?? { key: { kind: "date" }, dir: -1 });
    useEffect(() => saveJson(SORT_KEY, sort), [sort]);
    // 정렬 기준을 배치 보드와 공유 → 그 레일에 하이라이트/배지. axis·날짜·시간만(그 외는 배치에 대응 레일 없음 → null).
    const setRankSort = useWorkbench((s) => s.setRankSort);
    useEffect(() => {
        const k = sort.key;
        const target = k.kind === "axis" ? k.axisId : k.kind === "date" || k.kind === "time" ? k.kind : null;
        setRankSort(target ? { target, dir: sort.dir } : null);
    }, [sort, setRankSort]);
    const nameOf = (code: string): string => r.nameOf(code);
    const sorted = useMemo(() => {
        const dir = sort.dir;
        const cmp = (a: SheetRow, b: SheetRow): number => {
            const k = sort.key;
            if (k.kind === "name") return r.nameOf(a.stockCode).localeCompare(r.nameOf(b.stockCode)) * dir;
            if (k.kind === "date") { // 날짜(dir) → 종목 → 시간 (그룹 정렬)
                if (a.date !== b.date) return a.date < b.date ? -dir : dir;
                if (a.stockCode !== b.stockCode) return a.stockCode < b.stockCode ? -1 : 1;
                return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
            }
            if (k.kind === "time") {
                if (a.time !== b.time) return a.time < b.time ? -dir : dir;
                return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; // 같은 시각 = 최근 날짜 먼저
            }
            if (k.kind === "outcome") return (a.outcome ?? "").localeCompare(b.outcome ?? "") * dir;
            if (k.kind === "tags") { // 붙은 태그 이름을 이어 붙여 사전순. 태그 없는 행은 방향 무관 바닥(미배치 관례와 동일).
                const ta = tagLabel(a), tb = tagLabel(b);
                if (!ta && !tb) return 0;
                if (!ta) return 1;
                if (!tb) return -1;
                return ta.localeCompare(tb) * dir;
            }
            const ek = k.kind as "mfe" | "maePre" | "maePost"; // 위에서 date/time/coverage/axis/outcome 처리됨
            const num = (row: SheetRow): number | null =>
                k.kind === "coverage" ? row.coverage : k.kind === "axis" ? (row.cells[k.axisId]?.rank ?? null) : (excByKey.get(pointKey(row))?.[ek] ?? null);
            const va = num(a), vb = num(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1; // 미배치/미산정 = 바닥
            if (vb == null) return -1;
            return (va - vb) * dir;
        };
        return [...rows].sort(cmp);
    }, [rows, sort, excByKey, r.nameOf]);

    // 핀은 필터/정렬 무관 상단 고정 행(작업셋), 일반 행에서는 제외(중복 방지).
    const pinnedRows = useMemo(() => {
        const items = pinned.map((k) => allByKey.get(k)).filter((x): x is ReviewPointListItem => !!x);
        return buildSheetRows(items, axisIds, indexByAxis);
    }, [pinned, allByKey, axisIds, indexByAxis]);
    const mainRows = sorted; // 핀 행도 기존 위치에 그대로(상단 고정 블록에 중복 표시, 삼각형으로 구분)

    const clickHeader = (key: SortKey): void => setSort((s) => ({ key, dir: sameSort(s.key, key) ? (s.dir === 1 ? -1 : 1) : (key.kind === "axis" ? 1 : -1) }));
    const sortAxisId = sort.key.kind === "axis" ? sort.key.axisId : null;
    const unplacedOnSort = sortAxisId ? mainRows.filter((row) => !row.cells[sortAxisId!]).length : 0;

    // ── 위치 표시 모드(숫자 기본 / 위치 바).
    const [posBar, setPosBar] = useState<boolean>(() => loadJson(POS_MODE_KEY, (o) => (typeof o === "boolean" ? o : null)) ?? true);
    useEffect(() => saveJson(POS_MODE_KEY, posBar), [posBar]);

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
    const [frozenCols, setFrozenCols] = useState<string[]>(() => loadJson(FROZEN_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? ["date", "time"]);
    const [hiddenCols, setHiddenCols] = useState<string[]>(() => loadJson(HIDDEN_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? []);
    useEffect(() => saveJson(FROZEN_KEY, frozenCols), [frozenCols]);
    useEffect(() => saveJson(HIDDEN_KEY, hiddenCols), [hiddenCols]);
    const frozenSet = useMemo(() => new Set(frozenCols), [frozenCols]);
    // 수동 열 폭(colKey → px). 지정한 열만 고정폭이 되고, 나머지 축 열은 잔여 폭 분배를 유지한다.
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => loadJson(WIDTHS_KEY, (o) => (o && typeof o === "object" ? (o as Record<string, number>) : null)) ?? {});
    useEffect(() => saveJson(WIDTHS_KEY, colWidths), [colWidths]);
    // 축을 지우면 그 축 키가 고정/숨김/폭 목록에 유령으로 남는다 → 축 목록이 로드된 뒤 한 번 청소.
    useEffect(() => {
        if (axes.length === 0) return;
        const ids = axes.map((a) => a.id);
        setFrozenCols((f) => pruneAxisKeys(f, ids));
        setHiddenCols((h) => pruneAxisKeys(h, ids));
        setColWidths((w) => pruneAxisKeys(w, ids));
    }, [axes]);
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

    // ── 우클릭 이상/이하 경계(드래그 선택 보완) — 어느 축 셀에서든 정밀 단일 경계.
    const [ctx, setCtx] = useState<{ axisId: string; slotId: string; x: number; y: number } | null>(null);
    // ── 열 이름 우클릭 = 고정/숨김 메뉴.
    const [hdrCtx, setHdrCtx] = useState<{ key: string; label: string; canHide: boolean; frozen: boolean; x: number; y: number } | null>(null);

    const navRow = (row: SheetRow): void => goToPoint({ date: row.date, code: row.stockCode, time: row.time }, "rank-sheet");
    const totalCols = displayCols.length;

    // ── 드래그 배치 — 핀(고정) 행 이름 → 정렬된 축 열. 정렬이 축일 때만 유효(그때만 열이 세로 라인).
    //  · droppable/over 에 의존 안 함(취약) — DndContext 는 droppable 없이도 onDragMove/End 발화, 포인터 좌표만으로 판정.
    const qc = useQueryClient();
    const placeMut = useMutation({
        mutationFn: (v: { axisId: string; point: RankPoint; target: RankTarget }) => placePoint(v.axisId, v.point, v.target),
        onSuccess: () => void qc.invalidateQueries({ queryKey: axisLinesQuery().queryKey }),
    });
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());     // tbody 행 pk → tr(드롭 Y 판정)
    const sortAxisThRef = useRef<HTMLTableCellElement | null>(null);         // 정렬 축 헤더(열 x 범위)
    const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [dragName, setDragName] = useState<string | null>(null);
    const [drop, setDrop] = useState<SheetDrop | null>(null);

    const computeSheetDrop = (clientX: number, clientY: number): SheetDrop | null => {
        if (!sortAxisId) return null;                       // 축으로 정렬해야 세로 라인
        const th = sortAxisThRef.current;
        if (!th) return null;
        const cr = th.getBoundingClientRect();
        if (clientX < cr.left || clientX > cr.right) return null; // 정렬 축 열 위에서만
        // DOM 측정만 여기서 — 판정 규칙(타이 ±px·타이그룹 합류·prev/next 방향)은 rankGeometry(순수, 테스트됨).
        const placed: RowGeom[] = [];
        for (const row of mainRows) {
            const cell = row.cells[sortAxisId];
            if (!cell) continue;
            const tr = rowRefs.current.get(pointKey(row));
            if (!tr) continue;
            const rr = tr.getBoundingClientRect();
            placed.push({ slotId: cell.slotId, orderKey: cell.orderKey, top: rr.top, bottom: rr.bottom, centerY: rr.top + rr.height / 2 });
        }
        return { ...computeRowDrop(placed, clientY, sort.dir, (cr.top + cr.bottom) / 2), x0: cr.left, x1: cr.right };
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
        if (point && sortAxisId) {
            const d = computeSheetDrop(dragStart.current.x + ev.delta.x, dragStart.current.y + ev.delta.y);
            if (d) placeMut.mutate({ axisId: sortAxisId, point, target: d.target });
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
                    onContextMenu: cell ? (ev) => { ev.preventDefault(); setCtx({ axisId, slotId: cell.slotId, x: ev.clientX, y: ev.clientY }); } : undefined,
                    title: "우클릭 = 이상/이하 밴드 · 클릭 = 이동",
                    style: { cursor: "pointer", background: frozen ? cellBgOpaque : sortAxisId === axisId ? "var(--bg-secondary)" : "transparent" },
                    body: <Cell cell={cell} posBar={posBar} prominent={focus} barWidth={widthOf(c) - 18} />,
                };
            },
            // 태그 — 폭이 모자라면 **그냥 잘린다**(wrap·스크롤 없음). 더 보고 싶으면 열 폭을 늘리는 게 이 표의 규칙.
            //   좁은 열이라 그룹 prefix 는 뗀다(색이 이미 그룹을 말한다). 전체 이름은 셀 툴팁에.
            tags: () => ({
                onClick: () => navRow(row),
                style: { cursor: "pointer", overflow: "hidden" },
                title: tagLabel(row) || undefined,
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
                    {hiddenCols.length > 0 && <button onClick={() => setHiddenCols([])} title="숨긴 열 모두 보이기" style={{ ...miniBtn, flexShrink: 0 }}>숨긴 열 {hiddenCols.length} ⤺</button>}
                    {Object.keys(colWidths).length > 0 && <button onClick={() => setColWidths({})} title="손으로 조절한 열 폭 전부 해제(기본 폭·축 잔여 분배로 복귀)" style={{ ...miniBtn, flexShrink: 0 }}>폭 원위치 ⤺</button>}
                </div>
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, flexShrink: 0 }}>
                    <SavedFilterControls axes={axes} />
                </span>
            </div>

            <RankFilterBar axes={axes} dateBounds={dateBounds} extra={<AddTagFilterButton />} />
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
                                const active = sameSort(sort.key, sk);
                                const left = leftOf.get(colKey(c));
                                const banded = c.key === "axis" && !!rankBands[c.axisId];
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
                                    <th key={colKey(c)} {...dnd} title={colLabel(c)}
                                        ref={c.key === "axis" && c.axisId === sortAxisId ? sortAxisThRef : undefined}
                                        onClick={() => clickHeader(sk)}
                                        onContextMenu={(e) => { e.preventDefault(); setHdrCtx({ key: colKey(c), label: colLabel(c), canHide: c.key !== "name", frozen: c.key === "name" || frozenSet.has(colKey(c)), x: e.clientX, y: e.clientY }); }}
                                        style={{ ...thBase, position: "relative", cursor: "pointer", color: active ? "var(--accent-primary)" : banded ? FILTER : "var(--text-tertiary)", borderBottom: banded ? `2px solid ${FILTER}` : thBase.borderBottom, ...(colKey(c) === lastFrozenKey ? { borderRight: "2px solid var(--border-strong)" } : {}), ...(left != null ? { position: "sticky", left, zIndex: 6, background: "var(--bg-secondary)" } : {}) }}>
                                        <span style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: 2, minWidth: 0 }}>
                                            {active && <span style={{ flexShrink: 0 }}>{sort.dir === 1 ? "▲" : "▼"}</span>}
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
                        {mainRows.flatMap((row, i) => {
                            const showGroup = sort.key.kind === "date" && (i === 0 || mainRows[i - 1].date !== row.date);
                            const out: JSX.Element[] = [];
                            if (showGroup) out.push(
                                <tr key={`g-${row.date}`} style={{ height: 22 }}>
                                    <td colSpan={totalCols} style={{ padding: 0, fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", background: "var(--bg-secondary)", borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-default)" }}>
                                        <span style={{ position: "sticky", left: 0, display: "inline-block", padding: "3px 10px" }}>{row.date.replace(/-/g, ".")}</span>
                                    </td>
                                </tr>,
                            );
                            out.push(renderRow(row));
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
                return (
                    <AxisBoundMenu anchor={ctx} axisName={ax.name} band={rankBands[ctx.axisId]} slotId={ctx.slotId}
                        onSet={(edge) => { setRankBound(ctx.axisId, edge, ctx.slotId); setCtx(null); }}
                        onClear={() => { clearRankBand(ctx.axisId); setCtx(null); }}
                        onClose={() => setCtx(null)} />
                );
            })()}

            {hdrCtx && (
                <HeaderMenu anchor={hdrCtx} label={hdrCtx.label} frozen={hdrCtx.frozen} canHide={hdrCtx.canHide} canFreeze={hdrCtx.key !== "name"}
                    onToggleFreeze={() => { toggleFrozen(hdrCtx.key); setHdrCtx(null); }}
                    onHide={() => { toggleHidden(hdrCtx.key); setHdrCtx(null); }}
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

// 열 이름 우클릭 메뉴 — 왼쪽 고정/해제 · 숨기기. (경계 메뉴는 배치 보드와 공용 AxisBoundMenu.)
function HeaderMenu({ anchor, label, frozen, canHide, canFreeze, onToggleFreeze, onHide, onClose }: {
    anchor: { x: number; y: number }; label: string; frozen: boolean; canHide: boolean; canFreeze: boolean;
    onToggleFreeze: () => void; onHide: () => void; onClose: () => void;
}): JSX.Element {
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={168} padding={0} placement="beside" offset={6}>
            <MenuLabel>{label}</MenuLabel>
            {canFreeze && <MenuItem onClick={onToggleFreeze}>{frozen ? "🔓 고정 해제" : "🔒 왼쪽 고정"}</MenuItem>}
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
const thBase: CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: "6px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" };
const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer" };
