import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { rankAxesQuery, axisLineQuery, allPointsQuery } from "../api/queries.js";
import { useRankFilterResult } from "./rank/useRankFilterResult.js";
import { buildAxisIndex, buildSheetRows, bandFromSelection, monthOf, pkOf, type AxisIndex, type RankCell, type SheetRow } from "./rank/rankSheet.js";
import { MonthPicker } from "./WorksetRows.js";
import { loadJson, saveJson } from "../store/persist.js";
import { useWorkbench } from "../store/workbench.js";
import type { PlacedPoint, ReviewPointListItem } from "@trade-data-manager/wire";
import type { Excursion } from "./rank/pathStats.js";

// 타점 분석 시트 — 행=타점 · 열=축별 순위 + 결과. 배치 현황과 결과 목록을 한 표로 통합.
//  · 셀 = 그 축 순위 `rank/total`(기본) 또는 위치 바(토글). 미배치 = 빈칸.
//  · 축 헤더 클릭 = 그 축 강도 정렬(강 먼저). 정렬 축에서 행범위 **드래그 선택 = 밴드**(AND drill-down, rankBands 공유).
//  · 밴드 활성 시 행=교집합, 결과 열(MFE/MAE/결과)이 lazy 로 붙는다(좁혔을 때만 경로 fetch). 미배치는 strict AND 로 탈락.
//  · 기간(전체/월)은 독립 필터. 열 순서는 배치 보드(wb.rankAxisOrder) 공유(정렬만, 편집은 보드에서).

const AXIS_ORDER_KEY = "wb.rankAxisOrder";
const POS_MODE_KEY = "wb.rankSheetPosMode";
const STRONG = "#1baf7a";
const WEAK = "#eb6834";

type SortKey =
    | { kind: "date" }
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
    const setRankBandRange = useWorkbench((s) => s.setRankBandRange);
    const clearRankBand = useWorkbench((s) => s.clearRankBand);
    const clearRankFilter = useWorkbench((s) => s.clearRankFilter);
    const undoRankBands = useWorkbench((s) => s.undoRankBands);

    // ── 축 + 라인 → 순위 인덱스(배치 보드와 같은 캐시 공유).
    const axesQ = useQuery(rankAxesQuery());
    const rawAxes = useMemo(() => axesQ.data ?? [], [axesQ.data]);
    const orderPref = useMemo(() => loadJson(AXIS_ORDER_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null)) ?? [], []);
    const axes = useMemo(() => {
        const idx = new Map(orderPref.map((id, i) => [id, i]));
        return [...rawAxes].sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity) || (a.id < b.id ? -1 : 1));
    }, [rawAxes, orderPref]);
    const axisIds = useMemo(() => axes.map((a) => a.id), [axes]);

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

    // 행 집합: 밴드 활성 → 교집합 ∩ 기간, 아니면 기간 전체.
    const rowPoints = useMemo<ReviewPointListItem[]>(() => {
        if (bandsActive) {
            const out: ReviewPointListItem[] = [];
            for (const k of interKeys) {
                const it = allByKey.get(k);
                if (it && inPeriod(it.date)) out.push(it);
            }
            return out;
        }
        return allPoints.filter((p) => inPeriod(p.date));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bandsActive, interKeys, allByKey, allPoints, period]);

    const rows = useMemo(() => buildSheetRows(rowPoints, axisIds, indexByAxis), [rowPoints, axisIds, indexByAxis]);

    // ── 정렬. 축 정렬 = 강(rank↑) 먼저, 미배치는 방향 무관 맨 아래로 가라앉힘.
    const [sort, setSort] = useState<Sort>({ key: { kind: "date" }, dir: -1 });
    const nameOf = (code: string): string => r.nameOf(code);
    const sorted = useMemo(() => {
        const val = (row: SheetRow): number | string | null => {
            const k = sort.key;
            switch (k.kind) {
                case "date": return `${row.date} ${row.time}`;
                case "coverage": return row.coverage;
                case "axis": return row.cells[k.axisId]?.rank ?? null; // null = 미배치
                case "outcome": return row.outcome ?? "";
                default: { const e = excByKey.get(pkOf(row)); return e ? e[k.kind] : null; }
            }
        };
        const withNull = sort.key.kind === "axis" || (sort.key.kind !== "date" && sort.key.kind !== "coverage" && sort.key.kind !== "outcome");
        return [...rows].sort((a, b) => {
            const va = val(a), vb = val(b);
            // 값 없음(미배치/미산정)은 항상 바닥.
            if (withNull) {
                if (va == null && vb == null) return 0;
                if (va == null) return 1;
                if (vb == null) return -1;
            }
            const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return c * sort.dir;
        });
    }, [rows, sort, excByKey]);

    const clickHeader = (key: SortKey): void => setSort((s) => ({ key, dir: sameSort(s.key, key) ? (s.dir === 1 ? -1 : 1) : (key.kind === "axis" ? 1 : -1) }));
    const sortAxisId = sort.key.kind === "axis" ? sort.key.axisId : null;
    const unplacedOnSort = sortAxisId ? sorted.filter((row) => !row.cells[sortAxisId!]).length : 0;

    // ── 위치 표시 모드(숫자 기본 / 위치 바).
    const [posBar, setPosBar] = useState<boolean>(() => loadJson(POS_MODE_KEY, (o) => (typeof o === "boolean" ? o : null)) ?? false);
    useEffect(() => saveJson(POS_MODE_KEY, posBar), [posBar]);

    // ── 정렬 축에서 드래그 선택 = 밴드(drill-down). start===end = 클릭 = goToPoint.
    const dragRef = useRef<{ axisId: string; start: number } | null>(null);
    const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
    const selRef = useRef<{ start: number; end: number } | null>(null);
    selRef.current = sel;
    const sortedRef = useRef<SheetRow[]>(sorted);
    sortedRef.current = sorted;

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
            const cells = sortedRef.current.slice(i0, i1 + 1).map((row) => row.cells[drag.axisId] ?? null);
            const band = bandFromSelection(cells);
            if (band) setRankBandRange(drag.axisId, band.lo, band.hi);
        };
        window.addEventListener("pointerup", onUp);
        return () => window.removeEventListener("pointerup", onUp);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startDrag = (axisId: string, index: number): void => { dragRef.current = { axisId, start: index }; setSel({ start: index, end: index }); };
    const enterDrag = (index: number): void => { if (dragRef.current) setSel((s) => (s ? { ...s, end: index } : { start: index, end: index })); };
    const inSel = (index: number): boolean => !!sel && index >= Math.min(sel.start, sel.end) && index <= Math.max(sel.start, sel.end);

    const navRow = (row: SheetRow): void => goToPoint({ date: row.date, code: row.stockCode, time: row.time }, "rank-sheet");

    if (axesQ.isLoading || pointsQ.isLoading) return <Wrap><div style={muted}>불러오는 중…</div></Wrap>;
    if (axes.length === 0) return <Wrap><div style={muted}>축이 없습니다. 배치 보드에서 축을 먼저 만들어 주세요.</div></Wrap>;

    const activeBandAxes = axes.filter((a) => rankBands[a.id]);

    return (
        <Wrap>
            {/* 헤더 — 기간 · 위치 토글 · 활성 밴드/undo · 행수 */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexWrap: "wrap" }}>
                <PeriodPicker period={period} months={months} onPick={setPeriod} />
                <button onClick={() => setPosBar((v) => !v)} title="셀 표시: 순위 숫자 ↔ 위치 바" style={toggleBtn(posBar)}>{posBar ? "위치바" : "숫자"}</button>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{sorted.length}행{bandsActive ? ` · 밴드 교집합(모수 ${r.coverage})` : ""}{sortAxisId && unplacedOnSort > 0 ? ` · 이 축 미배치 ${unplacedOnSort}` : ""}</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {activeBandAxes.map((a) => (
                        <button key={a.id} onClick={() => clearRankBand(a.id)} title="이 축 밴드 해제" style={bandChip}>{a.name} ✕</button>
                    ))}
                    {rankBandsPast.length > 0 && <button onClick={undoRankBands} title="밴드 한 칸 되돌리기" style={miniBtn}>↶ 되돌리기</button>}
                    {bandsActive && <button onClick={clearRankFilter} title="밴드 전체 해제" style={miniBtn}>전체해제</button>}
                </div>
            </div>

            {/* 표 */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, userSelect: sel ? "none" : "auto" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-secondary)" }}>
                        <tr>
                            <Th label="종목" onClick={() => clickHeader({ kind: "date" })} active={sort.key.kind === "date"} dir={sort.dir} />
                            <Th label="타점" onClick={() => clickHeader({ kind: "date" })} active={sort.key.kind === "date"} dir={sort.dir} align="right" />
                            {axes.map((a) => (
                                <Th key={a.id} label={a.name} title={`${a.name} — 클릭: 강도 정렬 · 정렬 상태에서 세로 드래그: 밴드`}
                                    onClick={() => clickHeader({ kind: "axis", axisId: a.id })}
                                    active={sortAxisId === a.id} dir={sort.dir} align="center" banded={!!rankBands[a.id]} />
                            ))}
                            <Th label="배치" title="배치된 축 수 / 전체 축" onClick={() => clickHeader({ kind: "coverage" })} active={sort.key.kind === "coverage"} dir={sort.dir} align="center" />
                            {bandsActive && (<>
                                <Th label="MFE" onClick={() => clickHeader({ kind: "mfe" })} active={sort.key.kind === "mfe"} dir={sort.dir} align="right" />
                                <Th label="MAE전" onClick={() => clickHeader({ kind: "maePre" })} active={sort.key.kind === "maePre"} dir={sort.dir} align="right" />
                                <Th label="MAE후" onClick={() => clickHeader({ kind: "maePost" })} active={sort.key.kind === "maePost"} dir={sort.dir} align="right" />
                                <Th label="결과" onClick={() => clickHeader({ kind: "outcome" })} active={sort.key.kind === "outcome"} dir={sort.dir} />
                            </>)}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((row, i) => {
                            const key = pkOf(row);
                            const focus = activeKey === key;
                            const e = bandsActive ? excByKey.get(key) : undefined;
                            return (
                                <tr key={key} style={{ borderBottom: "1px solid var(--border-subtle)", background: focus ? "var(--accent-soft)" : "transparent" }}>
                                    <td onClick={() => navRow(row)} style={{ ...td, fontWeight: 600, whiteSpace: "nowrap", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", borderLeft: `3px solid ${focus ? "var(--accent-primary)" : "transparent"}`, color: focus ? "var(--accent-primary)" : undefined }}>{nameOf(row.stockCode)}</td>
                                    <td onClick={() => navRow(row)} style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", textAlign: "right", cursor: "pointer", lineHeight: 1.15 }}>
                                        <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{row.date.slice(2).replace(/-/g, ".")}</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-primary)" }}>{row.time.slice(0, 5)}</div>
                                    </td>
                                    {axes.map((a) => {
                                        const cell = row.cells[a.id];
                                        const isSortAxis = sortAxisId === a.id;
                                        const selected = isSortAxis && inSel(i);
                                        return (
                                            <td key={a.id}
                                                onPointerDown={isSortAxis ? () => startDrag(a.id, i) : undefined}
                                                onPointerEnter={isSortAxis ? () => enterDrag(i) : undefined}
                                                onClick={!isSortAxis ? () => navRow(row) : undefined}
                                                title={isSortAxis ? "세로 드래그 = 밴드 · 클릭 = 이동" : undefined}
                                                style={{ ...tdCell, cursor: isSortAxis ? "ns-resize" : "pointer", background: selected ? "var(--accent-soft)" : isSortAxis ? "var(--bg-secondary)" : "transparent" }}>
                                                <Cell cell={cell} posBar={posBar} />
                                            </td>
                                        );
                                    })}
                                    <td style={{ ...tdCell, color: row.coverage === axes.length ? STRONG : "var(--text-secondary)" }}>{row.coverage}/{axes.length}</td>
                                    {bandsActive && (<>
                                        <td style={{ ...tdNum, color: STRONG }}>{e ? "+" + e.mfe.toFixed(1) : "—"}</td>
                                        <td style={{ ...tdNum, color: WEAK }}>{e ? e.maePre.toFixed(1) : "—"}</td>
                                        <td style={{ ...tdNum, color: WEAK }}>{e ? e.maePost.toFixed(1) : "—"}</td>
                                        <td style={td}>
                                            {row.outcome && <span style={{ fontSize: 11, color: outcomeColor(row.outcome) }}>{row.outcome}</span>}
                                            {row.type && <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 5 }}>{row.type}</span>}
                                        </td>
                                    </>)}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {bandsActive && r.isLoading && <div style={muted}>경로 산정 중…</div>}
                {sorted.length === 0 && <div style={muted}>{bandsActive ? "이 조건에 맞는 타점이 없습니다." : "이 기간에 타점이 없습니다."}</div>}
            </div>
        </Wrap>
    );
}

// ── 순위 셀(숫자 `rank/total` 또는 위치 바). 미배치 = 흐린 점.
function Cell({ cell, posBar }: { cell: RankCell | null; posBar: boolean }): JSX.Element {
    if (!cell) return <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>;
    if (!posBar) return <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{cell.rank}<span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>/{cell.total}</span></span>;
    // 위치 바: 왼쪽=약, 오른쪽=강. 점을 frac 위치에.
    return (
        <span style={{ position: "relative", display: "inline-block", width: 46, height: 8, verticalAlign: "middle", background: "var(--bg-tertiary)", borderRadius: 4 }} title={`${cell.rank}/${cell.total}`}>
            <span style={{ position: "absolute", top: "50%", left: `${cell.frac * 100}%`, width: 7, height: 7, borderRadius: "50%", background: cell.frac >= 0.5 ? STRONG : WEAK, transform: "translate(-50%,-50%)" }} />
        </span>
    );
}

function Th({ label, title, onClick, active, dir, align = "left", banded }: { label: string; title?: string; onClick: () => void; active: boolean; dir: 1 | -1; align?: "left" | "right" | "center"; banded?: boolean }): JSX.Element {
    return (
        <th onClick={onClick} title={title} style={{ ...thBase, textAlign: align, cursor: "pointer", color: active ? "var(--accent-primary)" : banded ? "#e24b4a" : "var(--text-tertiary)", borderBottom: banded ? "2px solid #e24b4a" : thBase.borderBottom }}>
            {label}{active ? (dir === 1 ? " ▲" : " ▼") : ""}
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
