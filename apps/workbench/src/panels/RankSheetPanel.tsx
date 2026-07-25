import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { rankAxesQuery, axisLineQuery, allPointsQuery } from "../api/queries.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { buildAxisIndex, buildSheetRows, monthOf, pkOf, type AxisIndex, type RankCell, type SheetRow } from "./rank/rankSheet.js";
import { MonthPicker } from "./WorksetRows.js";
import { SavedFilterBar } from "./rank/SavedFilterBar.js";
import { loadJson, saveJson } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import type { PlacedPoint, ReviewPointListItem } from "@trade-data-manager/wire";
import type { Excursion } from "./rank/pathStats.js";

// 타점 분석 시트 — 행=타점 · 열=축별 순위 + 결과. 배치 현황과 결과 목록을 한 표로 통합.
//  · 셀 = 그 축 순위 `rank/total`(기본) 또는 위치 바(토글). 미배치 = 빈칸.
//  · 축 헤더 클릭 = 그 축 강도 정렬(강 먼저). 정렬 축에서 행범위 **드래그 선택 = 밴드**(AND drill-down, rankBands 공유).
//  · 밴드 활성 시 행=교집합, 결과 열(MFE/MAE/결과)이 lazy 로 붙는다(좁혔을 때만 경로 fetch). 미배치는 strict AND 로 탈락.
//  · 기간(전체/월)은 독립 필터. 열 순서는 배치 보드와 **양방향 동기화**(store rankAxisOrder, 열 헤더 드래그 재정렬).
//  · 링크: 드래그=소프트 선택(색만, 안 좁힘, 누적) · 우클릭=밴드(좁힘) · 선택/호버는 배치 보드와 공유(색으로 표시).

const POS_MODE_KEY = "wb.rankSheetPosMode";
const FROZEN_KEY = "wb.rankSheetFrozenAxes";
const FILTERMODE_KEY = "wb.rankSheetFilterMode";
const SOFT = "#f59e0b"; // 소프트 선택(앰버) — 현재 타점(스카이블루)과 구분.
const PIN = "#8b5cf6"; // 핀=작업셋(보라) — 소프트(앰버)·현재(블루)와 구분.
// 고정폭(table-layout:fixed + colgroup) — 열 고정 sticky 오프셋이 실제 폭과 정확히 맞도록.
const NAME_W = 118;
const DATE_W = 50;
const TIME_W = 44;
const AXIS_W = 56;
const COV_W = 44;
const NUM_W = 50;
const OUT_W = 88;
const ID_W = NAME_W + DATE_W + TIME_W; // 식별 3열(항상 고정)
const HDR_H = 30; // 헤더 높이(핀 sticky top 오프셋 기준)
const PINNED_ROW_H = 28; // 핀 고정행 높이(sticky 누적 오프셋)
const STRONG = "#1baf7a";
const MID = "#f5a623";
const WEAK = "#eb6834";
const heatOf = (frac: number): string => (frac >= 0.66 ? STRONG : frac >= 0.33 ? MID : WEAK);

type SortKey =
    | { kind: "date" }
    | { kind: "time" }
    | { kind: "coverage" }
    | { kind: "axis"; axisId: string }
    | { kind: "mfe" | "maePre" | "maePost" | "outcome" };
type Sort = { key: SortKey; dir: 1 | -1 };

const sameSort = (a: SortKey, b: SortKey): boolean => (a.kind === "axis" && b.kind === "axis" ? a.axisId === b.axisId : a.kind === b.kind);

function outcomeColor(v?: string): string {
    if (!v) return "var(--text-tertiary)";
    if (/성공|승|익절|win|good/i.test(v)) return STRONG;
    if (/실패|패|손절|loss|bad/i.test(v)) return "#e24b4a";
    return "var(--text-secondary)";
}

export function RankSheetPanel(): JSX.Element {
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const activePoint = useWorkbench((s) => s.activePoint);
    const activeKey = activePoint ? `${activePoint.code}|${activePoint.date}|${activePoint.time}` : null;

    const rankBands = useWorkbench((s) => s.rankBands);
    const rankBandsPast = useWorkbench((s) => s.rankBandsPast);
    const setRankBound = useWorkbench((s) => s.setRankBound);
    const clearRankBand = useWorkbench((s) => s.clearRankBand);
    const clearRankFilter = useWorkbench((s) => s.clearRankFilter);
    const undoRankBands = useWorkbench((s) => s.undoRankBands);

    // ── 링크 공유 상태(배치 보드와 양방향) — 소프트 선택·호버·축순서.
    const softSelected = useWorkbench((s) => s.softSelected);
    const addSoftSelect = useWorkbench((s) => s.addSoftSelect);
    const clearSoftSelect = useWorkbench((s) => s.clearSoftSelect);
    const hoveredPoint = useWorkbench((s) => s.hoveredPoint);
    const setHoveredPoint = useWorkbench((s) => s.setHoveredPoint);
    const pinned = useWorkbench((s) => s.pinned);
    const togglePin = useWorkbench((s) => s.togglePin);
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
    const orderPref = useWorkbench((s) => s.rankAxisOrder);
    const setRankAxisOrder = useWorkbench((s) => s.setRankAxisOrder);
    // 소프트 선택은 축별 — 그 축 셀만 강조(행 전체 X). axisId → Set<pk>.
    const softSets = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const [axisId, keys] of Object.entries(softSelected)) m.set(axisId, new Set(keys));
        return m;
    }, [softSelected]);
    const softCount = useMemo(() => Object.values(softSelected).reduce((n, a) => n + a.length, 0), [softSelected]);

    // ── 축 + 라인 → 순위 인덱스(배치 보드와 같은 캐시 공유).
    const axesQ = useQuery(rankAxesQuery());
    const rawAxes = useMemo(() => axesQ.data ?? [], [axesQ.data]);
    const axes = useMemo(() => {
        const idx = new Map(orderPref.map((id, i) => [id, i]));
        return [...rawAxes].sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity) || (a.id < b.id ? -1 : 1));
    }, [rawAxes, orderPref]);
    const axisIds = useMemo(() => axes.map((a) => a.id), [axes]);
    // 열 재정렬(양방향 동기화) — 드래그한 축을 대상 축 앞에 삽입, 전체 순서를 store 로.
    const reorderAxis = (draggedId: string, targetId: string): void => {
        if (draggedId === targetId) return;
        const ids = axes.map((a) => a.id);
        const from = ids.indexOf(draggedId), to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setRankAxisOrder(ids);
    };

    const lineQs = useQueries({ queries: axes.map((a) => axisLineQuery(a.id)) });
    const indexByAxis = useMemo(() => {
        const m = new Map<string, AxisIndex>();
        axes.forEach((a, i) => m.set(a.id, buildAxisIndex((lineQs[i]?.data ?? []) as PlacedPoint[])));
        return m;
    }, [axes, lineQs]);

    // ── 전체 타점(행 원천) + 기간.
    const pointsQ = useQuery(allPointsQuery());
    const allPoints = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);
    const allByKey = useMemo(() => {
        const m = new Map<string, ReviewPointListItem>();
        for (const p of allPoints) m.set(pkOf(p), p);
        return m;
    }, [allPoints]);
    const months = useMemo(() => [...new Set(allPoints.map((p) => monthOf(p.date)))].sort().reverse(), [allPoints]);
    const [period, setPeriod] = useState<string | null>(null); // null = 전체
    const inPeriod = (date: string): boolean => period == null || monthOf(date) === period;

    // ── 결과(분석) — 밴드 교집합 + 경로 통계(좁혔을 때만 lazy). 배치 셀은 위 인덱스에서 별도 조립.
    const r = useRankFilterResult();
    const bandsActive = !r.isEmpty;
    const interKeys = useMemo(() => new Set(r.points.map(pkOf)), [r.points]);
    const excByKey = useMemo(() => {
        const m = new Map<string, Excursion>();
        for (const e of r.stats.excursions) m.set(e.key, e);
        return m;
    }, [r.stats.excursions]);

    // 필터 표시 모드 — narrow(교집합만) / dim(전체 유지, 밴드 밖 흐리게). 영속.
    const [filterMode, setFilterMode] = useState<"narrow" | "dim">(() => (loadJson(FILTERMODE_KEY, (o) => (o === "dim" ? "dim" : o === "narrow" ? "narrow" : null)) ?? "narrow"));
    useEffect(() => saveJson(FILTERMODE_KEY, filterMode), [filterMode]);

    // 행 집합: narrow + 밴드 활성 → 교집합 ∩ 기간. dim 또는 무밴드 → 기간 전체(밴드 밖은 렌더에서 흐리게).
    const rowPoints = useMemo<ReviewPointListItem[]>(() => {
        if (bandsActive && filterMode === "narrow") {
            const out: ReviewPointListItem[] = [];
            for (const k of interKeys) {
                const it = allByKey.get(k);
                if (it && inPeriod(it.date)) out.push(it);
            }
            return out;
        }
        return allPoints.filter((p) => inPeriod(p.date));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bandsActive, filterMode, interKeys, allByKey, allPoints, period]);

    const rows = useMemo(() => buildSheetRows(rowPoints, axisIds, indexByAxis), [rowPoints, axisIds, indexByAxis]);

    // ── 정렬. 축 정렬 = 강(rank↑) 먼저, 미배치는 방향 무관 맨 아래로 가라앉힘.
    const [sort, setSort] = useState<Sort>({ key: { kind: "date" }, dir: -1 });
    const nameOf = (code: string): string => r.nameOf(code);
    const sorted = useMemo(() => {
        const dir = sort.dir;
        const cmp = (a: SheetRow, b: SheetRow): number => {
            const k = sort.key;
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
                k.kind === "coverage" ? row.coverage : k.kind === "axis" ? (row.cells[k.axisId]?.rank ?? null) : (excByKey.get(pkOf(row))?.[ek] ?? null);
            const va = num(a), vb = num(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1; // 미배치/미산정 = 바닥
            if (vb == null) return -1;
            return (va - vb) * dir;
        };
        return [...rows].sort(cmp);
    }, [rows, sort, excByKey]);

    // 핀은 필터/정렬 무관 상단 고정 행(작업셋), 일반 행에서는 제외(중복 방지).
    const pinnedRows = useMemo(() => {
        const items = pinned.map((k) => allByKey.get(k)).filter((x): x is ReviewPointListItem => !!x);
        return buildSheetRows(items, axisIds, indexByAxis);
    }, [pinned, allByKey, axisIds, indexByAxis]);
    const mainRows = useMemo(() => sorted.filter((row) => !pinnedSet.has(pkOf(row))), [sorted, pinnedSet]);

    const clickHeader = (key: SortKey): void => setSort((s) => ({ key, dir: sameSort(s.key, key) ? (s.dir === 1 ? -1 : 1) : (key.kind === "axis" ? 1 : -1) }));
    const sortAxisId = sort.key.kind === "axis" ? sort.key.axisId : null;
    const unplacedOnSort = sortAxisId ? mainRows.filter((row) => !row.cells[sortAxisId!]).length : 0;

    // ── 위치 표시 모드(숫자 기본 / 위치 바).
    const [posBar, setPosBar] = useState<boolean>(() => loadJson(POS_MODE_KEY, (o) => (typeof o === "boolean" ? o : null)) ?? false);
    useEffect(() => saveJson(POS_MODE_KEY, posBar), [posBar]);

    // ── 열 고정 — 식별 3열(종목·날짜·시간)은 항상, + 앞쪽 축 N개 추가 고정(헤더 🔒 토글). 영속.
    const [frozenAxes, setFrozenAxes] = useState<number>(() => loadJson(FROZEN_KEY, (o) => (typeof o === "number" ? o : null)) ?? 0);
    useEffect(() => saveJson(FROZEN_KEY, frozenAxes), [frozenAxes]);
    const frozenN = Math.min(frozenAxes, axes.length);
    const axisLeft = (ai: number): number | undefined => (ai < frozenN ? ID_W + ai * AXIS_W : undefined); // 고정 축의 sticky left 오프셋
    const tableW = ID_W + axes.length * AXIS_W + COV_W + (bandsActive ? 3 * NUM_W + OUT_W : 0);

    // ── 우클릭 이상/이하 경계(드래그 선택 보완) — 어느 축 셀에서든 정밀 단일 경계.
    const [ctx, setCtx] = useState<{ axisId: string; slotId: string; x: number; y: number } | null>(null);

    // ── 정렬 축에서 드래그 = 소프트 선택(색만·누적·안 좁힘). start===end = 클릭 = goToPoint. (좁히기=우클릭 밴드)
    const dragRef = useRef<{ axisId: string; start: number } | null>(null);
    const [sel, setSel] = useState<{ axisId: string; start: number; end: number } | null>(null);
    const selRef = useRef<{ axisId: string; start: number; end: number } | null>(null);
    selRef.current = sel;
    const sortedRef = useRef<SheetRow[]>(mainRows);
    sortedRef.current = mainRows;

    useEffect(() => {
        const onUp = (): void => {
            const drag = dragRef.current;
            const range = selRef.current;
            dragRef.current = null;
            setSel(null);
            if (!drag) return;
            if (!range || range.start === range.end) {
                const row = sortedRef.current[drag.start];
                if (row) goToPoint({ date: row.date, code: row.stockCode, time: row.time }, "rank-sheet");
                return;
            }
            const [i0, i1] = [Math.min(range.start, range.end), Math.max(range.start, range.end)];
            const keys = sortedRef.current.slice(i0, i1 + 1).map((row) => pkOf(row));
            addSoftSelect(drag.axisId, keys);
        };
        window.addEventListener("pointerup", onUp);
        return () => window.removeEventListener("pointerup", onUp);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startDrag = (axisId: string, index: number): void => { dragRef.current = { axisId, start: index }; setSel({ axisId, start: index, end: index }); };
    const enterDrag = (index: number): void => { if (dragRef.current) setSel((s) => (s ? { ...s, end: index } : null)); };
    const inSel = (axisId: string, index: number): boolean => !!sel && sel.axisId === axisId && index >= Math.min(sel.start, sel.end) && index <= Math.max(sel.start, sel.end);

    const navRow = (row: SheetRow): void => goToPoint({ date: row.date, code: row.stockCode, time: row.time }, "rank-sheet");
    const totalCols = 3 + axes.length + (bandsActive ? 4 : 0);

    // 한 행 렌더. index=null → 핀 상단행(드래그 없음). stickyTop!=null → 핀 고정(세로 sticky, 스크롤해도 보임).
    const renderRow = (row: SheetRow, index: number | null, stickyTop: number | null): JSX.Element => {
        const key = pkOf(row);
        const focus = activeKey === key;
        const isHover = hoveredPoint === key;
        const isPinned = pinnedSet.has(key);
        const dim = !isPinned && bandsActive && filterMode === "dim" && !interKeys.has(key);
        const e = bandsActive ? excByKey.get(key) : undefined;
        const draggable = index != null;
        const zBase = stickyTop != null ? 2 : 0; // 핀행 > 일반행
        const rowBg = focus ? "var(--accent-soft)" : isHover ? "var(--bg-secondary)" : stickyTop != null ? "var(--bg-primary)" : "transparent";
        const idBg = focus ? "var(--accent-soft)" : isHover ? "var(--bg-secondary)" : "var(--bg-primary)";
        // 열 고정 sticky — left(있으면 고정열) + top(핀행). 고정열은 불투명 idBg, 핀행 비고정칸은 rowBg.
        const stick = (left: number | undefined): CSSProperties => {
            const s: CSSProperties = {};
            if (left != null) { s.position = "sticky"; s.left = left; s.zIndex = zBase + 1; s.background = idBg; }
            if (stickyTop != null) { s.position = "sticky"; s.top = stickyTop; if (left == null) { s.zIndex = zBase; s.background = rowBg; } }
            return s;
        };
        return (
            <tr key={key} onMouseEnter={() => setHoveredPoint(key)} onMouseLeave={() => setHoveredPoint(null)}
                style={{ borderBottom: "1px solid var(--border-subtle)", background: rowBg, opacity: dim ? 0.38 : 1, height: stickyTop != null ? PINNED_ROW_H : undefined }}>
                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap", borderLeft: `3px solid ${focus ? "var(--accent-primary)" : isPinned ? PIN : "transparent"}`, ...stick(0) }}>
                    <span onClick={() => navRow(row)} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: focus ? "var(--accent-primary)" : undefined, paddingRight: (isHover || isPinned) ? 16 : 0 }}>{nameOf(row.stockCode)}</span>
                    {(isHover || isPinned) && (
                        <button onClick={(ev) => { ev.stopPropagation(); togglePin(key); }} title={isPinned ? "핀 해제(▼)" : "핀 고정(▲)"}
                            style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: isPinned ? PIN : "var(--text-tertiary)", fontSize: 12, lineHeight: 1, padding: 0 }}>{isPinned ? "▼" : "▲"}</button>
                    )}
                </td>
                <td onClick={() => navRow(row)} style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "right", cursor: "pointer", fontSize: 11, color: "var(--text-secondary)", ...stick(NAME_W) }}>{row.date.slice(2).replace(/-/g, ".")}</td>
                <td onClick={() => navRow(row)} style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "right", cursor: "pointer", fontWeight: 600, color: "var(--accent-primary)", ...stick(NAME_W + DATE_W) }}>{row.time.slice(0, 5)}</td>
                {axes.map((a, ai) => {
                    const cell = row.cells[a.id];
                    const isSortAxis = sortAxisId === a.id;
                    const selected = draggable && index != null && inSel(a.id, index);
                    const isSoft = softSets.get(a.id)?.has(key) ?? false;
                    const cellBg = selected ? "var(--accent-soft)" : isSoft ? "rgba(245,158,11,0.18)" : isSortAxis ? "var(--bg-secondary)" : "transparent";
                    const frozen = stick(axisLeft(ai));
                    return (
                        <td key={a.id}
                            onPointerDown={draggable && index != null ? () => startDrag(a.id, index) : undefined}
                            onPointerEnter={draggable && index != null ? () => enterDrag(index) : undefined}
                            onClick={!draggable ? () => navRow(row) : undefined}
                            onContextMenu={cell ? (ev) => { ev.preventDefault(); setCtx({ axisId: a.id, slotId: cell.slotId, x: ev.clientX, y: ev.clientY }); } : undefined}
                            title="세로 드래그 = 이 축 소프트 선택 · 우클릭 = 이상/이하 밴드 · 클릭 = 이동"
                            style={{ ...tdCell, cursor: draggable ? "ns-resize" : "pointer", ...frozen, background: axisLeft(ai) != null && cellBg === "transparent" ? idBg : cellBg, boxShadow: isSoft ? `inset 0 0 0 1px ${SOFT}` : undefined }}>
                            <Cell cell={cell} posBar={posBar} prominent={focus} />
                        </td>
                    );
                })}
                <td style={{ ...tdCell, color: row.coverage === axes.length ? STRONG : "var(--text-secondary)", ...stick(undefined) }}>{row.coverage}/{axes.length}</td>
                {bandsActive && (<>
                    <td style={{ ...tdNum, color: STRONG, ...stick(undefined) }}>{e ? "+" + e.mfe.toFixed(1) : "—"}</td>
                    <td style={{ ...tdNum, color: WEAK, ...stick(undefined) }}>{e ? e.maePre.toFixed(1) : "—"}</td>
                    <td style={{ ...tdNum, color: WEAK, ...stick(undefined) }}>{e ? e.maePost.toFixed(1) : "—"}</td>
                    <td style={{ ...td, ...stick(undefined) }}>
                        {row.outcome && <span style={{ fontSize: 11, color: outcomeColor(row.outcome) }}>{row.outcome}</span>}
                        {row.type && <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 5 }}>{row.type}</span>}
                    </td>
                </>)}
            </tr>
        );
    };

    if (axesQ.isLoading || pointsQ.isLoading) return <Wrap><div style={muted}>불러오는 중…</div></Wrap>;
    if (axes.length === 0) return <Wrap><div style={muted}>축이 없습니다. 배치 보드에서 축을 먼저 만들어 주세요.</div></Wrap>;

    const activeBandAxes = axes.filter((a) => rankBands[a.id]);

    return (
        <Wrap>
            {/* 헤더 — 기간 · 위치 토글 · 활성 밴드/undo · 행수 */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexWrap: "wrap" }}>
                <PeriodPicker period={period} months={months} onPick={setPeriod} />
                <button onClick={() => setPosBar((v) => !v)} title="셀 표시: 순위 숫자 ↔ 위치 눈금" style={toggleBtn(posBar)}>{posBar ? "눈금" : "숫자"}</button>
                {bandsActive && <button onClick={() => setFilterMode((m) => (m === "narrow" ? "dim" : "narrow"))} title="필터 표시: 좁히기 ↔ 흐리게" style={toggleBtn(filterMode === "dim")}>{filterMode === "dim" ? "흐리게" : "좁히기"}</button>}
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{mainRows.length}행{bandsActive ? ` · ${filterMode === "dim" ? "매칭 " + interKeys.size : "교집합"}(모수 ${r.coverage})` : ""}{sortAxisId && unplacedOnSort > 0 ? ` · 이 축 미배치 ${unplacedOnSort}` : ""}</span>
                {softCount > 0 && (
                    <button onClick={clearSoftSelect} title="소프트 선택 해제(축별)" style={{ ...miniBtn, color: SOFT, borderColor: SOFT }}>선택 {softCount} ✕</button>
                )}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {activeBandAxes.map((a) => (
                        <button key={a.id} onClick={() => clearRankBand(a.id)} title="이 축 밴드 해제" style={bandChip}>{a.name} ✕</button>
                    ))}
                    {rankBandsPast.length > 0 && <button onClick={undoRankBands} title="밴드 한 칸 되돌리기" style={miniBtn}>↶ 되돌리기</button>}
                    {bandsActive && <button onClick={clearRankFilter} title="밴드 전체 해제" style={miniBtn}>전체해제</button>}
                </div>
            </div>

            <SavedFilterBar axes={axes} />

            {/* 표 — 고정폭(table-layout:fixed)·열 고정·핀 상단 sticky·날짜 그룹 */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <table style={{ tableLayout: "fixed", width: tableW, borderCollapse: "collapse", fontSize: 12, userSelect: sel ? "none" : "auto" }}>
                    <colgroup>
                        <col style={{ width: NAME_W }} />
                        <col style={{ width: DATE_W }} />
                        <col style={{ width: TIME_W }} />
                        {axes.map((a) => <col key={a.id} style={{ width: AXIS_W }} />)}
                        <col style={{ width: COV_W }} />
                        {bandsActive && <><col style={{ width: NUM_W }} /><col style={{ width: NUM_W }} /><col style={{ width: NUM_W }} /><col style={{ width: OUT_W }} /></>}
                    </colgroup>
                    <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--bg-secondary)" }}>
                        <tr>
                            <Th label="종목" onClick={() => clickHeader({ kind: "date" })} active={sort.key.kind === "date"} dir={sort.dir} stickyLeft={0} width={NAME_W} />
                            <Th label="날짜" onClick={() => clickHeader({ kind: "date" })} active={sort.key.kind === "date"} dir={sort.dir} align="right" stickyLeft={NAME_W} width={DATE_W} />
                            <Th label="시간" onClick={() => clickHeader({ kind: "time" })} active={sort.key.kind === "time"} dir={sort.dir} align="right" stickyLeft={NAME_W + DATE_W} width={TIME_W} />
                            {axes.map((a, ai) => (
                                <Th key={a.id} label={a.name} title={`${a.name} — 클릭: 강도 정렬 · 드래그: 열 순서 · 🔒: 왼쪽 고정`}
                                    onClick={() => clickHeader({ kind: "axis", axisId: a.id })}
                                    active={sortAxisId === a.id} dir={sort.dir} align="center" banded={!!rankBands[a.id]}
                                    dragId={a.id} onReorder={reorderAxis} width={AXIS_W}
                                    stickyLeft={axisLeft(ai)} frozen={ai < frozenN} onToggleFreeze={() => setFrozenAxes(ai < frozenN ? ai : ai + 1)} />
                            ))}
                            <Th label="배치" title="배치된 축 수 / 전체 축" onClick={() => clickHeader({ kind: "coverage" })} active={sort.key.kind === "coverage"} dir={sort.dir} align="center" width={COV_W} />
                            {bandsActive && (<>
                                <Th label="MFE" onClick={() => clickHeader({ kind: "mfe" })} active={sort.key.kind === "mfe"} dir={sort.dir} align="right" width={NUM_W} />
                                <Th label="MAE전" onClick={() => clickHeader({ kind: "maePre" })} active={sort.key.kind === "maePre"} dir={sort.dir} align="right" width={NUM_W} />
                                <Th label="MAE후" onClick={() => clickHeader({ kind: "maePost" })} active={sort.key.kind === "maePost"} dir={sort.dir} align="right" width={NUM_W} />
                                <Th label="결과" onClick={() => clickHeader({ kind: "outcome" })} active={sort.key.kind === "outcome"} dir={sort.dir} width={OUT_W} />
                            </>)}
                        </tr>
                    </thead>
                    <tbody>
                        {pinnedRows.map((row, j) => renderRow(row, null, HDR_H + j * PINNED_ROW_H))}
                        {pinnedRows.length > 0 && mainRows.length > 0 && (
                            <tr key="pin-divider"><td colSpan={totalCols} style={{ padding: 0, height: 2, borderBottom: `2px solid ${PIN}`, background: "transparent" }} /></tr>
                        )}
                        {mainRows.flatMap((row, i) => {
                            const showGroup = sort.key.kind === "date" && (i === 0 || mainRows[i - 1].date !== row.date);
                            const out: JSX.Element[] = [];
                            if (showGroup) out.push(<tr key={`g-${row.date}`}><td colSpan={totalCols} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", background: "var(--bg-secondary)", borderTop: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-default)", position: "sticky", left: 0 }}>{row.date.replace(/-/g, ".")}</td></tr>);
                            out.push(renderRow(row, i, null));
                            return out;
                        })}
                    </tbody>
                </table>
                {bandsActive && r.isLoading && <div style={muted}>경로 산정 중…</div>}
                {pinnedRows.length === 0 && mainRows.length === 0 && <div style={muted}>{bandsActive ? "이 조건에 맞는 타점이 없습니다." : "이 기간에 타점이 없습니다."}</div>}
            </div>

            {ctx && (() => {
                const ax = axes.find((a) => a.id === ctx.axisId);
                if (!ax) return null;
                const band = rankBands[ctx.axisId];
                return (
                    <BoundMenu x={ctx.x} y={ctx.y} axisName={ax.name} isLo={band?.lo === ctx.slotId} isHi={band?.hi === ctx.slotId} hasBand={!!(band?.lo || band?.hi)}
                        onSet={(edge) => { setRankBound(ctx.axisId, edge, ctx.slotId); setCtx(null); }}
                        onClear={() => { clearRankBand(ctx.axisId); setCtx(null); }}
                        onClose={() => setCtx(null)} />
                );
            })()}
        </Wrap>
    );
}

// 우클릭 경계 메뉴 — 이상(lo)/이하(hi)/해제. 이미 그 경계면 해제 표기(토글).
function BoundMenu({ x, y, axisName, isLo, isHi, hasBand, onSet, onClear, onClose }: { x: number; y: number; axisName: string; isLo: boolean; isHi: boolean; hasBand: boolean; onSet: (edge: "lo" | "hi") => void; onClear: () => void; onClose: () => void }): JSX.Element {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const h = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        const id = setTimeout(() => document.addEventListener("mousedown", h), 0);
        return () => { clearTimeout(id); document.removeEventListener("mousedown", h); };
    }, [onClose]);
    const item: CSSProperties = { display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", fontSize: 12.5, padding: "7px 12px" };
    const left = Math.min(x + 4, window.innerWidth - 190);
    const top = Math.min(y + 4, window.innerHeight - 130);
    return createPortal(
        <div ref={ref} style={{ position: "fixed", left, top, zIndex: 60, minWidth: 176, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.24)", overflow: "hidden" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", padding: "8px 12px 4px" }}>{axisName} · 필터 경계</div>
            <button style={item} onClick={() => onSet("lo")}><span style={{ color: "#e24b4a", fontWeight: 700 }}>▶</span> {isLo ? "이상 경계 해제" : "이상 경계(이 지점부터)"}</button>
            <button style={item} onClick={() => onSet("hi")}><span style={{ color: "#e24b4a", fontWeight: 700 }}>◀</span> {isHi ? "이하 경계 해제" : "이하 경계(이 지점까지)"}</button>
            {hasBand && <button style={{ ...item, borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }} onClick={onClear}>이 축 필터 초기화</button>}
        </div>,
        document.body,
    );
}

// ── 순위 셀(숫자 `rank/total` 또는 위치 눈금 틱). 미배치 = 흐린 점. prominent(선택 행) = 불릿처럼 굵게.
function Cell({ cell, posBar, prominent }: { cell: RankCell | null; posBar: boolean; prominent?: boolean }): JSX.Element {
    if (!cell) return <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>;
    if (!posBar) return <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{cell.rank}<span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>/{cell.total}</span></span>;
    // 눈금 틱: 얇은 선 + 세로 틱(색=위치 히트). 선택 행은 굵은 불릿(테두리 링)으로 선명.
    const col = heatOf(cell.frac);
    return (
        <span style={{ position: "relative", display: "inline-block", width: 52, height: 14, verticalAlign: "middle" }} title={`${cell.rank}/${cell.total}`}>
            <span style={{ position: "absolute", left: 2, right: 2, top: "50%", height: 1, background: "var(--border-strong)", transform: "translateY(-50%)" }} />
            <span style={{ position: "absolute", top: "50%", left: `calc(4px + ${cell.frac} * (100% - 8px))`, width: prominent ? 4 : 3, height: prominent ? 13 : 11, background: col, transform: "translate(-50%,-50%)", borderRadius: 2, boxShadow: prominent ? "0 0 0 1.5px var(--bg-primary)" : undefined }} />
        </span>
    );
}

function Th({ label, title, onClick, active, dir, align = "left", banded, dragId, onReorder, stickyLeft, width, frozen, onToggleFreeze }: { label: string; title?: string; onClick: () => void; active: boolean; dir: 1 | -1; align?: "left" | "right" | "center"; banded?: boolean; dragId?: string; onReorder?: (draggedId: string, targetId: string) => void; stickyLeft?: number; width?: number; frozen?: boolean; onToggleFreeze?: () => void }): JSX.Element {
    const dnd = dragId && onReorder
        ? {
            draggable: true,
            onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("application/x-rank-axis", dragId); e.dataTransfer.effectAllowed = "move"; },
            onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("application/x-rank-axis")) e.preventDefault(); },
            onDrop: (e: React.DragEvent) => { const id = e.dataTransfer.getData("application/x-rank-axis"); if (id) onReorder(id, dragId); },
        }
        : {};
    const sticky: CSSProperties = stickyLeft != null ? { position: "sticky", left: stickyLeft, top: 0, zIndex: 6, background: "var(--bg-secondary)" } : {};
    return (
        <th {...dnd} title={title} style={{ ...thBase, textAlign: align, position: "relative", color: active ? "var(--accent-primary)" : banded ? "#e24b4a" : "var(--text-tertiary)", borderBottom: banded ? "2px solid #e24b4a" : thBase.borderBottom, width, ...sticky }}>
            <span onClick={onClick} style={{ cursor: "pointer" }}>{label}{active ? (dir === 1 ? " ▲" : " ▼") : ""}</span>
            {onToggleFreeze && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFreeze(); }} title={frozen ? "열 고정 해제" : "여기까지 왼쪽 고정"}
                    style={{ position: "absolute", right: 1, top: 2, border: "none", background: "transparent", cursor: "pointer", color: frozen ? "var(--accent-primary)" : "var(--text-tertiary)", opacity: frozen ? 1 : 0.35, fontSize: 9, lineHeight: 1, padding: 0 }}>{frozen ? "🔒" : "🔓"}</button>
            )}
        </th>
    );
}

// 기간 선택 — 전체 + 월 프리셋(작업셋 MonthPicker 재사용, 전체는 별도 버튼).
function PeriodPicker({ period, months, onPick }: { period: string | null; months: string[]; onPick: (m: string | null) => void }): JSX.Element {
    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => onPick(null)} style={toggleBtn(period == null)} title="전체 기간">전체</button>
            {period != null && <MonthPicker month={period} months={months} onPick={onPick} />}
            {period == null && months.length > 0 && (
                <button onClick={() => onPick(months[0])} style={miniBtn} title="월별 보기">월…</button>
            )}
        </div>
    );
}

const Wrap = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" }}>{children}</div>
);
const muted: CSSProperties = { color: "var(--text-tertiary)", fontSize: 12.5, padding: "16px 12px" };
const thBase: CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: "6px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "5px 8px", color: "var(--text-primary)" };
const tdCell: CSSProperties = { padding: "5px 8px", textAlign: "center" };
const tdNum: CSSProperties = { padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" };
const bandChip: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(226,75,74,0.12)", color: "#e24b4a", border: "1px solid rgba(226,75,74,0.4)", cursor: "pointer" };
const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "transparent", color: "var(--text-tertiary)", border: "1px solid var(--border-default)", cursor: "pointer" };
function toggleBtn(active: boolean): CSSProperties {
    return { fontSize: 11.5, padding: "2px 9px", borderRadius: 4, background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent-primary)" : "var(--text-secondary)", border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`, cursor: "pointer", fontWeight: 600 };
}
