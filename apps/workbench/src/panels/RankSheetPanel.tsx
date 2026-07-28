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
import { buildAxisIndex, type AxisIndex, type RankCell } from "../lib/rankIndex.js";
import { useRankAxes } from "../lib/useRankAxes.js";
import { computeRowDrop, type RowGeom } from "./rank/rankGeometry.js";
import { SavedFilterBar } from "./rank/SavedFilterBar.js";
import { RankFilterBar } from "./rank/RankFilterBar.js";
import { TextToggle, Dot, ControlBox } from "../components/ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { AxisBoundMenu } from "./rank/AxisBoundMenu.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
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
//  · 기간(전체/월)은 독립 필터. 열 순서는 배치 보드와 **양방향 동기화**(store rankAxisOrder, 열 헤더 드래그 재정렬).
//  · 링크: 드래그=소프트 선택(색만, 안 좁힘, 누적) · 우클릭=밴드(좁힘) · 선택/호버는 배치 보드와 공유(색으로 표시).

const POS_MODE_KEY = "wb.rankSheetPosMode";
const FROZEN_KEY = "wb.rankSheetFrozenCols";
const HIDDEN_KEY = "wb.rankSheetHiddenCols";
const FILTERMODE_KEY = "wb.rankSheetFilterMode";
const SORT_KEY = "wb.rankSheetSort"; // 정렬 기준 영속(다른 시트 설정과 동일 패턴) — 프리셋 전환·새로고침에 유지.
// 스크롤 위치는 세션 한정(모듈 메모) — 프리셋 전환(재마운트)엔 이어지고 새로고침엔 초기화(목록 중간 튐 방지).
let sheetScroll = { top: 0, left: 0 };
const PIN = PIN_COLOR;
// 고정폭(table-layout:fixed + colgroup) — 열 고정 sticky 오프셋이 실제 폭과 정확히 맞도록.
const NAME_W = 96;
const DATE_W = 66;
const TIME_W = 46;
const AXIS_W = 58;
const COV_W = 44;
const NUM_W = 50;
const OUT_W = 88;
const ROW_H = 30; // 모든 행 고정 높이 → 핀 sticky top 오프셋을 정확히 계산.

// 열 기술자 — 표는 이 목록을 순회해 헤더/셀을 그린다. 고정(집합)/숨김(집합)/순서를 한 곳에서 계산.
type Col =
    | { key: "name" }
    | { key: "date" }
    | { key: "time" }
    | { key: "axis"; axisId: string; name: string }
    | { key: "coverage" }
    | { key: "mfe" | "maePre" | "maePost" | "outcome" };
type ColKind = Col["key"];

// td 기본 스타일 3종 — COL_META 가 참조하므로 테이블보다 먼저 선언한다.
const td: CSSProperties = { padding: "5px 8px", color: "var(--text-primary)" };
const tdCell: CSSProperties = { padding: "5px 8px", textAlign: "center" };
const tdNum: CSSProperties = { padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" };

// 열 종류별 고정 속성 한 테이블 — 폭·헤더 라벨·정렬(가로)·td 기본 스타일.
// 예전엔 이 넷이 각각 삼항 체인이라 열을 하나 붙일 때마다 네 군데를 같이 고쳐야 했다(하나 빠뜨리면
// 폭만 안 맞거나 라벨이 빈칸). 셀 렌더는 아래 CELLS(패널 상태를 닫아야 해서 컴포넌트 안)와 한 쌍.
interface ColMeta {
    width: number;
    label: string; // axis 는 축 이름이라 런타임 override(colLabel)
    justify: "flex-start" | "center" | "flex-end";
    td: CSSProperties;
}
const COL_META: Record<ColKind, ColMeta> = {
    name: { width: NAME_W, label: "종목", justify: "flex-start", td: td },
    date: { width: DATE_W, label: "날짜", justify: "center", td: td },
    time: { width: TIME_W, label: "시간", justify: "center", td: td },
    axis: { width: AXIS_W, label: "", justify: "center", td: tdCell },
    coverage: { width: COV_W, label: "배치", justify: "center", td: tdCell },
    mfe: { width: NUM_W, label: "MFE", justify: "flex-end", td: tdNum },
    maePre: { width: NUM_W, label: "MAE전", justify: "flex-end", td: tdNum },
    maePost: { width: NUM_W, label: "MAE후", justify: "flex-end", td: tdNum },
    outcome: { width: OUT_W, label: "결과", justify: "flex-start", td: td },
};
const colKey = (c: Col): string => (c.key === "axis" ? `ax:${c.axisId}` : c.key);
const colWidth = (c: Col): number => COL_META[c.key].width;
const colLabel = (c: Col): string => (c.key === "axis" ? c.name : COL_META[c.key].label);
/** 열 → 그 열로 정렬할 때의 키. axis 만 축 id 를 실어야 해서 분기 하나. */
const sortKeyOf = (c: Col): SortKey => (c.key === "axis" ? { kind: "axis", axisId: c.axisId } : { kind: c.key });

type SortKey =
    | { kind: "name" }
    | { kind: "date" }
    | { kind: "time" }
    | { kind: "coverage" }
    | { kind: "axis"; axisId: string }
    | { kind: "mfe" | "maePre" | "maePost" | "outcome" };
type Sort = { key: SortKey; dir: 1 | -1 };

const sameSort = (a: SortKey, b: SortKey): boolean => (a.kind === "axis" && b.kind === "axis" ? a.axisId === b.axisId : a.kind === b.kind);
const SORT_KINDS = ["name", "date", "time", "coverage", "mfe", "maePre", "maePost", "outcome", "axis"];
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
    const hiddenSet = useMemo(() => new Set(hiddenCols), [hiddenCols]);
    const toggleFrozen = (k: string): void => setFrozenCols((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
    const toggleHidden = (k: string): void => setHiddenCols((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));

    // 기본 순서 → 숨김 제외 → 고정 먼저(기본순 유지, 좌측 스택) → 비고정. 종목은 항상 표시·고정.
    const baseCols = useMemo<Col[]>(() => [
        { key: "name" }, { key: "date" }, { key: "time" },
        ...axes.map((a): Col => ({ key: "axis", axisId: a.id, name: a.name })),
        { key: "coverage" },
        ...(bandsActive ? ([{ key: "mfe" }, { key: "maePre" }, { key: "maePost" }, { key: "outcome" }] as Col[]) : []),
    ], [axes, bandsActive]);
    const { displayCols, leftOf, tableW, axisW, lastFrozenKey } = useMemo(() => {
        const visible = baseCols.filter((c) => c.key === "name" || !hiddenSet.has(colKey(c)));
        const isFrozen = (c: Col): boolean => c.key === "name" || frozenSet.has(colKey(c));
        const frozen = visible.filter(isFrozen);
        const cols = [...frozen, ...visible.filter((c) => !isFrozen(c))];
        // 축 열 유연 폭: 남는 폭을 축들이 나눠 넓힘(최소 axisMin). 좁으면 axisMin(가로 스크롤).
        const nAxis = cols.filter((c) => c.key === "axis").length;
        const fixed = cols.reduce((s, c) => s + (c.key === "axis" ? 0 : colWidth(c)), 0);
        const grown = nAxis > 0 && containerW > fixed + nAxis * axisMin ? Math.floor((containerW - fixed) / nAxis) : axisMin;
        const wOf = (c: Col): number => (c.key === "axis" ? grown : colWidth(c));
        const left = new Map<string, number>();
        let acc = 0;
        for (const c of frozen) { left.set(colKey(c), acc); acc += wOf(c); }
        return { displayCols: cols, leftOf: left, tableW: cols.reduce((s, c) => s + wOf(c), 0), axisW: grown, lastFrozenKey: frozen.length ? colKey(frozen[frozen.length - 1]) : null };
    }, [baseCols, frozenSet, hiddenSet, containerW, axisMin]);
    const widthOf = (c: Col): number => (c.key === "axis" ? axisW : colWidth(c));

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
                    body: <Cell cell={cell} posBar={posBar} prominent={focus} barWidth={axisW - 18} />,
                };
            },
            coverage: () => ({
                style: { color: row.coverage === axes.length ? STRONG : "var(--text-secondary)" },
                body: `${row.coverage}/${axes.length}`,
            }),
            outcome: () => ({
                body: (
                    <>
                        {row.outcome && <span style={{ fontSize: 11, color: outcomeColor(row.outcome) }}>{row.outcome}</span>}
                        {row.type && <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 5 }}>{row.type}</span>}
                    </>
                ),
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
                </div>
            </div>

            <SavedFilterBar axes={axes} />
            <RankFilterBar axes={axes} dateBounds={dateBounds} />

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
                                const dnd = c.key === "axis" ? {
                                    draggable: true,
                                    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("application/x-rank-axis", (c as { axisId: string }).axisId); e.dataTransfer.effectAllowed = "move"; },
                                    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("application/x-rank-axis")) e.preventDefault(); },
                                    onDrop: (e: React.DragEvent) => { const id = e.dataTransfer.getData("application/x-rank-axis"); if (id) reorderAxis(id, (c as { axisId: string }).axisId); },
                                } : {};
                                return (
                                    <th key={colKey(c)} {...dnd} title={colLabel(c)}
                                        ref={c.key === "axis" && c.axisId === sortAxisId ? sortAxisThRef : undefined}
                                        onClick={() => clickHeader(sk)}
                                        onContextMenu={(e) => { e.preventDefault(); setHdrCtx({ key: colKey(c), label: colLabel(c), canHide: c.key !== "name", frozen: c.key === "name" || frozenSet.has(colKey(c)), x: e.clientX, y: e.clientY }); }}
                                        style={{ ...thBase, cursor: "pointer", color: active ? "var(--accent-primary)" : banded ? FILTER : "var(--text-tertiary)", borderBottom: banded ? `2px solid ${FILTER}` : thBase.borderBottom, ...(colKey(c) === lastFrozenKey ? { borderRight: "2px solid var(--border-strong)" } : {}), ...(left != null ? { position: "sticky", left, zIndex: 6, background: "var(--bg-secondary)" } : {}) }}>
                                        <span style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: 2, minWidth: 0 }}>
                                            {active && <span style={{ flexShrink: 0 }}>{sort.dir === 1 ? "▲" : "▼"}</span>}
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{colLabel(c)}</span>
                                        </span>
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
