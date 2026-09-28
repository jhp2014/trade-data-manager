// 라벨 타점 [탐색] — 내가 붙인 라벨을 **전 기간 한 목록**으로 보는 판(2026-09-28). 탐색판(하루 후보를 날짜로 걷기)의 짝.
// 규칙: .claude/decisions.md 「라벨 타점 [탐색]」.
// 행 = 라벨 좌표, 날짜 머리줄 → 종목 머리줄 → 시간(최근순) · 열 = 고른 라벨 ≤10(◆ 타점 / ▣ 하루, 자동 기본 없음).
// 칸: 직접 ● · 하위 경유 ○(계층 상속) — ▣ 하루 라벨도 그날 타점 줄에 똑같이 찍는다. 종목 이름줄 = 이름 + 테마뿐
// (타점 없이 하루 라벨만 있는 차트는 시간 자리에 「타점 없음」 줄 하나 — 그 줄에 똑같이 찍는다). 열별 집계 숫자는 없다.
// 날짜 넘기기가 없다 — 라벨은 희소해 한 목록에 다 선다. 기간 = 전 기간(전역 월 시선에 안 묶는다).
// 재료 = 그룹 멤버십 직독(셀 엔진 평가 없음).
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { RowNavBadge } from "../../components/RowNavBadge.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { usePublishRowNav } from "../../lib/rowNav.js";
import { useDock } from "../../store/dock.js";
import { useGroupAssign } from "../../store/groupAssign.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { seriesColor } from "../../styles/palette.js";
import { groupNumberOf } from "../dailyExplore/exploreRows.js";
import { GroupLegend, HeadLine, TREE_INDENT, Td, Th, ThemeChips, dotCell, headLineCell, ScrollBox, revealRow, stickL, thBase, treeTimeCell } from "../dailyExplore/exploreTable.js";
import { LabelColMenu } from "./LabelColMenu.js";
import {
    labelChartsOf, labelColKey, navOrderOf, noPointCellOf, parseLabelCols, pointCellOf, shownRowsOf, stepFrom,
    type LabelCell, type LabelCol, type LabelRange, type LabelRow,
} from "./labelRows.js";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;
const ORIGIN = "label-explore";
/** 열 저장물 기본값 — 모듈 상수(usePanelUi 는 저장값이 없으면 기본값을 그대로 돌려준다: 렌더마다 새 [] 면 아래 memo 가 전부 헛돈다). */
const NO_COLS: readonly unknown[] = [];

interface Col extends LabelCol {
    key: string;
    num: string;
    color: string;
}

export function LabelExplorePanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    // ⚠ 순회 함수는 최상단에서 얹는다 — 로딩 조기 반환 안쪽이면 후보 자격이 깜빡인다(decisions 「행 순회 소유권」).
    const navRef = usePublishRowNav("label-explore");

    const g = useGroups();
    const { nameOf } = useStockNamesDict();
    const themeIndex = useThemeIndex().index;
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusTime = useWorkbench((s) => s.focus.time);

    const [rawCols, setRawCols] = usePanelUi<unknown>(panelId, "labelCols", NO_COLS);
    const [range, setRange] = usePanelUi<LabelRange>(panelId, "rowRange", "cols");
    const [legendOpen, setLegendOpen] = usePanelUi<boolean>(panelId, "legendOpen", true);
    // 사전이 **왔을 때만** 지워진 이름을 거른다 — 모름(미도착)에서 거르면 열이 통째로 사라진다. 판정은 ready 로
    // (사전 크기로 재면 마지막 그룹까지 지운 빈 사전이 "모름"으로 읽혀 지워진 이름이 열로 되살아난다).
    const cols = useMemo<Col[]>(() => parseLabelCols(rawCols)
        .filter((c) => !g.ready || g.groupByName.has(c.name))
        .map((c, i) => ({ ...c, key: labelColKey(c), num: groupNumberOf(i), color: seriesColor(i) })), [rawCols, g.ready, g.groupByName]);

    // ── 좁히기 — 열 머리·범례 클릭 = 그 열 ●/○ 행만(다시 = 해제). 세션 상태.
    const [narrowKey, setNarrowKey] = useState<string | null>(null);
    const narrowCol = cols.find((c) => c.key === narrowKey) ?? null;
    useEffect(() => { if (narrowKey !== null && !cols.some((c) => c.key === narrowKey)) setNarrowKey(null); }, [narrowKey, cols]);
    const toggleNarrow = (key: string): void => setNarrowKey((v) => (v === key ? null : key));

    const charts = useMemo(() => labelChartsOf(g.memberships, g.pointMemberships, g.groupByName), [g.memberships, g.pointMemberships, g.groupByName]);
    const rows = useMemo(() => (g.ready ? shownRowsOf(charts, cols, range, narrowCol) : []), [g.ready, charts, cols, range, narrowCol]);
    const totalPoints = useMemo(() => charts.reduce((n, c) => n + c.points.length, 0), [charts]);
    const shownPoints = useMemo(() => rows.reduce((n, r) => n + (r.kind === "point" ? 1 : 0), 0), [rows]);
    const shownDays = useMemo(() => rows.reduce((n, r) => n + (r.kind === "date" ? 1 : 0), 0), [rows]);

    // ── w/s — 날짜 경계 없이 목록 전체. 「타점 없음」 줄 = goToDay(time null).
    const order = useMemo(() => navOrderOf(rows), [rows]);
    const cursor = focusCode ? { code: focusCode, date: focusDate, time: focusTime } : null;
    const go = (to: { code: string; date: string; time?: string }): void => {
        const wb = useWorkbench.getState();
        if (to.time !== undefined) wb.goToPoint({ date: to.date, code: to.code, time: to.time }, ORIGIN);
        else wb.goToDay({ date: to.date, code: to.code }, ORIGIN);
    };
    navRef.current = (dir): void => {
        const step = stepFrom(order, cursor, dir);
        if (step?.kind === "move") go(step.to);
    };
    const pos = useMemo(() => {
        if (!focusCode) return null;
        const at = order.findIndex((k) => k.code === focusCode && k.date === focusDate && (k.time ?? null) === focusTime);
        return at < 0 ? null : at + 1;
    }, [order, focusCode, focusDate, focusTime]);

    /** 그룹 배정 — 종목 이름줄·「타점 없음」 줄 우클릭 = 하루(차트), 타점 줄 우클릭 = 좌표. **행의 날짜**를 넘긴다(행마다 다르다). */
    const openAssign = (ev: React.MouseEvent, code: string, date: string, time?: string): void => {
        ev.preventDefault();
        useGroupAssign.getState().open({ stockCode: code, name: nameOf(code), date, ...(time !== undefined ? { time } : {}) }, { x: ev.clientX, y: ev.clientY });
    };

    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "toggle", id: "range", name: range === "cols" ? "고른 라벨" : "모든 라벨", on: range === "cols",
            help: "고른 라벨 = 고른 열 중 하나라도 ●/○ 인 타점만 · 모든 라벨 = 라벨 붙은 타점 전부(열은 표시만)",
            set: () => setRange((v) => (v === "cols" ? "all" : "cols")),
        },
        {
            kind: "action", id: "cols", name: `라벨 열 ${cols.length}`, on: menuAt !== null,
            help: "열로 세울 라벨 고르기 — ◆ 타점 / ▣ 하루, 최대 10개. 부모를 고르면 하위가 ○ 로 잡힌다",
            run: (at) => setMenuAt((v) => (v === null ? { x: at.clientX, y: at.clientY } : null)),
        },
    ], [range, setRange, cols.length, menuAt]);

    // ── 포커스 따라가기 — 날짜도 바뀌므로 deps 에 넣는다(탐색판은 날짜 고정이라 빠져 있다).
    const focusRowRef = useRef<HTMLTableRowElement | null>(null);
    useEffect(() => { revealRow(focusRowRef.current); }, [focusDate, focusCode, focusTime]);

    const note = !g.ready ? (g.isLoading ? "불러오는 중…" : "라벨 데이터를 못 불러왔습니다")
        : charts.length === 0 ? "붙인 라벨이 없습니다 — 차트·목록 우클릭으로 붙입니다"
        : range === "cols" && cols.length === 0 && narrowCol === null ? "열을 고르면 그 라벨이 붙은 타점이 섭니다 — 머리의 「라벨 열」, 또는 「모든 라벨」"
        : rows.length === 0 ? "고른 라벨이 붙은 타점이 없습니다"
        : null;
    // 시간 칸 — 「타점 없음」 글자가 들어가게 라벨판만 넓게 고정(그 줄이 생겼다 없어질 때 폭이 흔들리지 않게).
    const timeW = LABEL_TIME_W;
    const colSpanAll = 2 + cols.length;

    const dot = (cell: LabelCell, color: string): JSX.Element | null =>
        cell === "na" ? null
            : cell === "direct" ? <span style={{ color }}>●</span>
            : cell === "inherited" ? <span style={{ color }}>○</span>
            : <span style={{ color: "var(--border-strong)" }}>·</span>;

    const renderRow = (r: LabelRow, i: number): JSX.Element => {
        if (r.kind === "date") {
            const wd = WEEKDAY[new Date(`${r.date}T00:00:00`).getDay()] ?? "";
            return (
                <tr key={`d:${r.date}`} data-head="">
                    <td colSpan={colSpanAll} style={{ ...dateCell, paddingTop: i === 0 ? 3 : 8 }}>
                        <span style={{ ...stickL(0), display: "inline-block", background: "inherit", paddingRight: 8 }}>{r.date} ({wd})</span>
                    </td>
                </tr>
            );
        }
        const { chart } = r;
        if (r.kind === "stock") {
            const onHead = (): void => go(r.firstTime !== null ? { code: chart.code, date: chart.date, time: r.firstTime } : { code: chart.code, date: chart.date });
            // 시각 없는 커서(다른 판에서 goToDay 로 옴)가 타점 있는 차트를 가리키면 이름줄로 따라간다 — 이 차트엔 「타점 없음」 줄이 없어
            // 받을 줄이 여기뿐이다(강조는 안 한다 — 이름줄은 칸이 없는 표제다).
            const follow = r.firstTime !== null && focusTime === null && chart.code === focusCode && chart.date === focusDate;
            return (
                <tr key={`s:${chart.code}|${chart.date}`} data-head="" ref={follow ? focusRowRef : undefined}>
                    <td colSpan={colSpanAll} style={{ ...headLineCell, paddingTop: 4 }}>
                        <HeadLine onContextMenu={(ev) => openAssign(ev, chart.code, chart.date)}>
                            <button onClick={onHead} className="row-self-marked"
                                title={r.firstTime === null ? "좌클릭 = 이 차트로 · 우클릭 = 그룹 배정(하루)" : "좌클릭 = 이 종목의 첫 타점으로 · 우클릭 = 그룹 배정(하루)"}
                                style={{ border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, padding: 0, color: "var(--text-primary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                                {nameOf(chart.code)}
                            </button>
                            <ThemeChips themes={themeIndex.themesOf(chart.code)} />
                        </HeadLine>
                    </td>
                </tr>
            );
        }
        // 타점 줄 · 「타점 없음」 줄 — 같은 모양. 「타점 없음」은 시각 없이 그 차트로(goToDay), 우클릭은 하루 배정.
        const time = r.kind === "point" ? r.point.time : null;
        const isFocus = chart.code === focusCode && chart.date === focusDate && time === focusTime;
        const rowBg = isFocus ? "var(--accent-soft)" : "var(--bg-primary)";
        const cellOf = (c: LabelCol): LabelCell => (r.kind === "point" ? pointCellOf(chart, r.point, c) : noPointCellOf(chart, c));
        return (
                <tr key={`p:${chart.code}|${chart.date}|${time ?? "none"}`} ref={isFocus ? focusRowRef : undefined}
                    onClick={() => go(time !== null ? { code: chart.code, date: chart.date, time } : { code: chart.code, date: chart.date })}
                    onContextMenu={(ev) => (time !== null ? openAssign(ev, chart.code, chart.date, time) : openAssign(ev, chart.code, chart.date))}
                    title={time !== null ? "좌클릭 = 이 타점으로 시선 이동(차트가 따라온다) · 우클릭 = 그룹 배정(좌표 라벨)"
                        : "이 차트엔 라벨 붙은 타점이 없다(하루 라벨만) — 좌클릭 = 이 차트로 · 우클릭 = 그룹 배정(하루)"}
                    style={{ cursor: "pointer", background: rowBg }}>
                    <Td style={{ ...stickL(0), backgroundColor: rowBg, paddingLeft: 8 + TREE_INDENT, borderBottom: "none", ...treeTimeCell(isFocus),
                        ...(time === null ? { fontSize: 11, whiteSpace: "nowrap", color: isFocus ? "var(--text-secondary)" : "var(--text-tertiary)" } : null) }}>
                        {time !== null ? time.slice(0, 5) : "타점 없음"}
                    </Td>
                    <Td style={{ borderBottom: "none" }} />
                    {cols.map((c) => <Td key={c.key} style={{ ...dotCell, borderBottom: "none" }}>{dot(cellOf(c), c.color)}</Td>)}
                </tr>
        );
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="4px 10px" style={{ whiteSpace: "nowrap" }}>
                <RowNavBadge owner="label-explore" />
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>라벨 타점</span>
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}
                    title={`보이는 타점 ${shownPoints} / 전체 라벨 타점 ${totalPoints} · ${shownDays}일 · ${pos !== null ? `순회 위치 ${pos}` : "커서 없음"}${narrowCol ? `\n좁히기: ${narrowCol.name}` : ""}`}>
                    ◆ {shownPoints} / {totalPoints} · {shownDays}일{pos !== null ? ` · ${pos}/${order.length}` : ""}
                </span>
                <HeaderControls controls={controls} storageKey="wb.headerPins.labelExplore" />
            </PanelHeader>

            <GroupLegend open={legendOpen} onToggleOpen={() => setLegendOpen((v) => !v)} narrowKey={narrowKey} onNarrow={toggleNarrow}
                empty="열로 세울 라벨이 없습니다 — 머리의 「라벨 열」에서 고르세요"
                cols={cols.map((c) => ({
                    key: c.key, num: c.num, color: c.color, clickable: true,
                    name: `${c.scope === "day" ? "▣ " : ""}${c.name}`,
                    title: colTitle(c, g.pathLabel(c.name, c.name)),
                }))} />

            <ScrollBox>
                {note !== null ? (
                    <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>{note}</div>
                ) : (
                    <table className="tabular" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                        <thead>
                            <tr>
                                <Th style={{ ...stickL(0), zIndex: 3, width: timeW, minWidth: timeW }} />
                                {/* 빈 칸이 남는 폭을 다 먹어 번호 열을 **시간 반대편**으로 민다(탐색판과 같은 자리). */}
                                <th style={{ ...thBase, width: "100%" }} />
                                {cols.map((c) => (
                                    <th key={c.key} title={colTitle(c, g.pathLabel(c.name, c.name))} onClick={() => toggleNarrow(c.key)}
                                        style={{ ...thBase, ...dotCell, fontSize: 11, cursor: "pointer", color: c.color,
                                            borderBottom: narrowKey === c.key ? `2px solid ${c.color}` : thBase.borderBottom }}>
                                        {c.num}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(renderRow)}
                            <tr><td colSpan={colSpanAll} style={{ height: 6 }} /></tr>
                        </tbody>
                    </table>
                )}
            </ScrollBox>

            {menuAt !== null && (
                <LabelColMenu anchor={menuAt} cols={cols.map(({ name, scope }) => ({ name, scope }))}
                    onPick={(next) => setRawCols(next)} onClose={() => setMenuAt(null)} />
            )}
        </div>
    );
}

/** 열 머리·범례 hover — 경로·종류·좁히기. (개수는 안 싣는다 — 집계는 이 판의 일이 아니다, 2026-09-28 사용자 확정.) */
const colTitle = (c: Col, path: string): string =>
    `${c.num} ${c.scope === "day" ? "▣ 하루" : "◆ 타점"} 라벨 — ${path}
클릭 = 이 열 ●/○ 행만(다시 = 해제)`;

/** 라벨판 시간 칸 폭 — 들여쓰기(26) + 「타점 없음」(11px) + 여백. */
const LABEL_TIME_W = 84;

/** 날짜 머리줄 칸 — 옅은 바탕으로 날짜 묶음을 가른다(종목 머리줄의 가는 선보다 한 단 위). */
const dateCell: React.CSSProperties = {
    background: "var(--bg-secondary)", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
    padding: "3px 8px", borderBottom: "0.5px solid var(--border-subtle)",
};
