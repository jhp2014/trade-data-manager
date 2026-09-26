// 일별 타점[탐색] — 하루 후보를 **날짜 단위로 걷는** 전용 뷰(2026-09-26). 작업 대상(시선·큐레이션 브라우징)과
// 다른 몫: 행 = 보는 집합의 그날 후보(기본 **종목순** — 종목 머리줄 아래 시간순, 토글로 시간순),
// 열 = **조건 그룹**(고른 저장 집합 4~5개)의 통과 ●/·.
// "어느 조건 덕에 나왔나"는 조건판이 아니라 이 뷰의 책임이다(사용자 확정).
//
// · 날짜 넘기 = 작업 대상과 같은 기계(useDayCrossing) — 목록 끝 w/s·◀▶ 로 이전/다음 거래일, 빈 날 스킵,
//   「날짜 고정」으로 잠금.
// · 조건 그룹 = 저장 집합 그 자체(새 저장물 없음). 그룹마다 그날 평가 한 벌 — 훅 규칙 때문에 **고정 5칸**으로
//   부른다(MAX_GROUPS). 캐시 선반은 12칸(useCellSet MEMO_CAP)이라 첫 방문 뒤엔 공짜다.
// · 잘리거나(그물) 오류인 그룹은 열 전체 "—" — 모름을 통과/탈락으로 찍지 않는다(exploreRows.groupColStateOf).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import { dataDatesQuery } from "../../api/queries.js";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { RowNavBadge } from "../../components/RowNavBadge.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { usePublishRowNav } from "../../lib/rowNav.js";
import { useDayReplayPrefetch } from "../../lib/useDaySnapshot.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { AnchoredPopover } from "../../ui/Dialog.js";
import { PIN } from "../../styles/palette.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { DAY_SET_OPTS, useCellSet } from "../filter/useCellSet.js";
import { leavesOf } from "../filter/expr.js";
import { neighborDates } from "../workset/dayCrossing.js";
import { useDayCrossing } from "../workset/useDayCrossing.js";
import { stepWithin, type NavKey } from "../workset/rows.js";
import { MAX_GROUPS, cellKeyOf, exploreRowsOf, type ExploreSort } from "./exploreRows.js";
import { useConditionGroups } from "./useConditionGroups.js";

const EMPTY_DATES: string[] = [];
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;
const fmtEok = (won: number): string => `${(won / 1e8).toFixed(won >= 1e10 ? 0 : 1)}억`;

export function DailyExplorePanel({ panelId }: { panelId: string }): JSX.Element {
    const funnel = useFunnel();
    const { nameOf } = useStockNamesDict();
    const mode = useWorkbench((s) => s.filterMode);
    const isDaily = mode === "daily";
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusTime = useWorkbench((s) => s.focus.time);
    const savedSets = useWorkbench((s) => s.savedSets);

    // ── 보는 집합의 그날 후보 — 차트 ◇·작업 대상과 같은 평가·같은 상한(300).
    const cellSet = useCellSet(isDaily ? funnel.slowExpr : null, funnel.slowSets, focusDate, DAY_SET_OPTS);
    // 기본 = 종목순(종목 안 시간순) — 대부분 종목 단위로 걷는다(사용자 확정). 순회(w/s)도 이 순서 그대로다.
    const [sortMode, setSortMode] = usePanelUi<ExploreSort>(panelId, "sortMode", "stock");
    const rows = useMemo(
        () => (cellSet.tooWide ? [] : exploreRowsOf(cellSet.hits, (code) => cellSet.byCode.get(code), minuteOfDayOf, sortMode)),
        [cellSet.tooWide, cellSet.hits, cellSet.byCode, sortMode],
    );

    // ── 조건 그룹 — 선택·평가는 useConditionGroups 한 벌(기본 차트 고스트 칩과 공유).
    // ⚠ 행이 없는 날(빈 날·로딩·잘림)엔 그룹도 안 돈다 — 자동 스킵이 지나는 날마다 5벌 평가를 물지 않게.
    const { picked, setPicked, groupSets, groupCols, groupName } = useConditionGroups(focusDate, isDaily && rows.length > 0);

    // ── 좁히기 — 열 머리 클릭 = 그 그룹 통과 행만(다시 = 해제). 세션 상태(시선이지 저장물이 아니다).
    const [narrowId, setNarrowId] = useState<string | null>(null);
    const narrowCol = groupCols.find((c) => c.setId === narrowId);
    // 그룹이 목록에서 빠지면 좁히기도 풀린다 — 안 풀면 "아무 열도 강조 안 됐는데 행이 줄어 있는" 상태가 남는다.
    useEffect(() => { if (narrowId !== null && !groupCols.some((c) => c.setId === narrowId)) setNarrowId(null); }, [narrowId, groupCols]);
    const shownRows = useMemo(() => {
        if (!narrowCol || narrowCol.state.kind !== "ready") return rows;
        const m = narrowCol.state.member;
        return rows.filter((r) => m.has(cellKeyOf(r.code, r.min)));
    }, [rows, narrowCol]);

    // ── 날짜 넘기 — 작업 대상과 같은 기계. ◀▶ 도 같은 손(빈 날 스킵·고정·상한이 한 규칙).
    const datesQ = useQuery({ ...dataDatesQuery(), enabled: isDaily });
    const [datePinned, setDatePinned] = usePanelUi<boolean>(panelId, "datePin", false);
    useDayReplayPrefetch(isDaily ? focusDate : null, useMemo(() => neighborDates(datesQ.data ?? EMPTY_DATES, focusDate), [datesQ.data, focusDate]));
    // 무거운 조건(격자·존 순위)이면 빈 날 스킵 상한이 줄어든다 — 작업 대상과 같은 판정.
    const heavy = useMemo(
        () => cellSet.stages.some((st) => st.counted)
            && leavesOf(funnel.slowExpr).some((st) => st.predicates.some((p) => p.kind === "gridPoint" || p.kind === "breakout" || (p.kind === "cellValue" && p.field === "zoneRank"))),
        [cellSet.stages, funnel.slowExpr],
    );
    const order = useMemo<NavKey[]>(() => shownRows.map((r) => ({ code: r.code, date: focusDate, time: r.time })), [shownRows, focusDate]);
    const orderRef = useRef(order);
    orderRef.current = order;
    const landOn = useCallback((dir: 1 | -1) => {
        // 착지 — 방향에 맞는 끝 항목으로. 넘긴 **뒤의** 행이 필요해 ref 로 읽는다(콜백 생성 시점의 행이 아니다).
        const o = orderRef.current;
        const to = dir > 0 ? o[0] : o[o.length - 1];
        if (to) useWorkbench.getState().goToPoint({ date: to.date, code: to.code, time: to.time ?? "" }, "daily-explore");
    }, []);
    const crossing = useDayCrossing({
        active: isDaily,
        dates: datesQ.data ?? EMPTY_DATES,
        ready: isDaily && !cellSet.isLoading,
        failed: cellSet.error !== null,
        count: order.length,
        heavy,
        pinned: datePinned,
        truncated: cellSet.truncated,
        onLand: landOn,
        origin: "explore-cross",
    });
    const canCross = isDaily && !cellSet.isLoading && !cellSet.tooWide && cellSet.error === null && !crossing.seeking;

    // ── w/s 순회 — 커서 = focus 그대로(하루 우주의 행은 좌표다 — 작업 대상과 같은 판단).
    const navRef = usePublishRowNav("daily-explore");
    navRef.current = (dir): void => {
        const cur = focusTime !== null ? { code: focusCode, date: focusDate, time: focusTime } : null;
        const step = stepWithin(order, cur, dir > 0 ? 1 : -1);
        if (step === null || step.kind === "boundary") {
            if (canCross) crossing.cross(step === null ? (dir > 0 ? 1 : -1) : step.dir);
            return;
        }
        useWorkbench.getState().goToPoint({ date: step.to.date, code: step.to.code, time: step.to.time ?? "" }, "daily-explore");
    };
    /** 순회 위치(1-base) — 커서가 목록에 없으면 null. */
    const pos = useMemo(() => {
        if (focusTime === null) return null;
        const at = order.findIndex((k) => k.code === focusCode && k.time === focusTime);
        return at < 0 ? null : at + 1;
    }, [order, focusCode, focusTime]);

    // ── 조건 그룹 고르기 판.
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "toggle", id: "sort", name: sortMode === "stock" ? "종목순" : "시간순", on: sortMode === "stock",
            help: "종목순 = 종목 머리줄 아래 시간순(기본 — 한 종목을 다 걷고 다음 종목) · 시간순 = 장 흐름대로 평탄",
            set: () => setSortMode((v) => (v === "stock" ? "time" : "stock")),
        },
        {
            kind: "toggle", id: "datePin", name: "날짜 고정", on: datePinned,
            help: "목록 끝에서 w/s·◀▶ 가 날짜를 안 넘긴다 — '이 날만 보겠다'는 선언",
            set: () => setDatePinned((v) => !v),
        },
        {
            kind: "action", id: "groups", name: `조건 그룹 ${groupCols.length}`, on: menuAt !== null,
            help: "열로 세울 조건 그룹(저장 집합) 고르기 — 최대 5개. 기본은 보는 집합의 최상위 부품",
            run: (at) => setMenuAt((v) => (v === null ? { x: at.clientX, y: at.clientY } : null)),
        },
    ], [sortMode, setSortMode, datePinned, setDatePinned, groupCols.length, menuAt]);

    // ── 포커스 행 따라가기 — 걷는 행이 화면 밖으로 나가지 않게.
    const focusRowRef = useRef<HTMLTableRowElement | null>(null);
    useEffect(() => { focusRowRef.current?.scrollIntoView({ block: "nearest" }); }, [focusCode, focusTime]);

    const note = !isDaily ? "하루 모드에서만 섭니다"
        : cellSet.error !== null ? `재료 조회 실패 — ${cellSet.error.message}`
        : !cellSet.evaluable ? "평가할 조건이 없습니다 — 조건판에서 조건을 걸거나 미연동 돌파 줄을 연결하세요"
        : cellSet.tooWide ? `${cellSet.matched.toLocaleString("ko-KR")}+ 너무 넓음 — 조건을 좁히세요`
        : cellSet.isLoading || !cellSet.ready ? "불러오는 중…"
        : rows.length === 0 ? "이 날은 후보가 없습니다"
        : null;
    const weekday = WEEKDAY[new Date(`${focusDate}T00:00:00`).getDay()] ?? "";

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="4px 10px" style={{ whiteSpace: "nowrap" }}>
                <RowNavBadge owner="daily-explore" />
                <button onClick={() => crossing.cross(-1)} disabled={crossing.seeking} title="이전 거래일 (목록 처음에서 w 로도 넘어간다)" style={navBtn}>◀</button>
                <span className="tabular" style={{ fontSize: 11.5, fontWeight: 600 }}>{focusDate} ({weekday})</span>
                <button onClick={() => crossing.cross(1)} disabled={crossing.seeking} title="다음 거래일 (목록 끝에서 s 로도 넘어간다)" style={navBtn}>▶</button>
                <span className="tabular" style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}
                    title={`그날 후보 ${rows.length}${cellSet.truncated ? " (상한 잘림)" : ""} · ${pos !== null ? `순회 위치 ${pos}` : "커서 없음"}${narrowCol ? `\n좁히기: ${narrowCol.name}` : ""}`}>
                    {narrowCol ? (narrowCol.state.kind === "ready" ? `후보 ${rows.length} · ${narrowCol.name} ${shownRows.length}` : `후보 ${rows.length} · ${narrowCol.name} …`) : `후보 ${rows.length}${pos !== null ? ` · ${pos}/${shownRows.length}` : ""}`}
                    {cellSet.truncated ? " · 잘림" : ""}
                </span>
                {(crossing.seeking || crossing.note !== null) && (
                    <span style={{ fontSize: 10.5, color: "var(--warning)" }}>
                        {crossing.seeking ? `날짜 넘기는 중…${crossing.skipped > 0 ? ` (${crossing.skipped}일 건너뜀)` : ""}` : crossing.note}
                    </span>
                )}
                <HeaderControls controls={controls} storageKey="wb.headerPins.dailyExplore" />
            </PanelHeader>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {note !== null ? (
                    <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>{note}</div>
                ) : (
                    <table className="tabular" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                        <thead>
                            <tr>
                                <Th style={{ width: 44 }}>시간</Th>
                                {sortMode === "time" && <Th>종목</Th>}
                                <Th style={{ textAlign: "right", width: 56 }}>대금</Th>
                                {groupCols.map((c) => (
                                    <th key={c.setId} style={{ ...thBase, textAlign: "center", maxWidth: 76, cursor: c.state.kind === "ready" ? "pointer" : "default", color: narrowId === c.setId ? c.color : "var(--text-tertiary)", borderBottom: narrowId === c.setId ? `2px solid ${c.color}` : thBase.borderBottom }}
                                        title={`${c.name}${c.state.kind === "ready" ? ` — 그날 통과 ${c.state.member.size.toLocaleString("ko-KR")}\n클릭 = 이 그룹 통과 행만(다시 = 해제)` : c.state.kind === "loading" ? " — 계산 중" : ` — ${c.state.why}`}`}
                                        onClick={() => { if (c.state.kind === "ready") setNarrowId((v) => (v === c.setId ? null : c.setId)); }}>
                                        <span style={{ display: "inline-block", maxWidth: 68, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>{c.name}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shownRows.map((r, i) => {
                                const isFocus = r.code === focusCode && r.time === focusTime;
                                // 종목순일 때만 종목 머리줄 — 이름만 싣는다(수·요약 없음, 사용자 확정). 클릭 = 그 종목 첫 타점.
                                const head = sortMode === "stock" && (i === 0 || shownRows[i - 1]!.code !== r.code) ? (
                                    <tr key={`head-${r.code}`}>
                                        <td colSpan={2 + groupCols.length} style={{ padding: 0, borderBottom: "0.5px solid var(--border-subtle)" }}>
                                            <button onClick={() => useWorkbench.getState().goToPoint({ date: focusDate, code: r.code, time: r.time }, "daily-explore")}
                                                title="이 종목의 첫 타점으로"
                                                style={{ display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 600, padding: "3px 8px", background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                                                {nameOf(r.code)}
                                            </button>
                                        </td>
                                    </tr>
                                ) : null;
                                return (
                                    <FragmentRow key={cellKeyOf(r.code, r.min)} head={head}>
                                    <tr ref={isFocus ? focusRowRef : undefined}
                                        onClick={() => useWorkbench.getState().goToPoint({ date: focusDate, code: r.code, time: r.time }, "daily-explore")}
                                        title="이 타점으로 시선 이동 — 차트가 따라온다"
                                        style={{ cursor: "pointer", background: isFocus ? "var(--accent-soft)" : "transparent" }}>
                                        <Td>{r.time.slice(0, 5)}</Td>
                                        {/* 종목순에선 열 자체를 접는다 — 머리줄이 이름을 말하는데 빈 열이 폭만 먹는다. */}
                                        {sortMode === "time" && (
                                            <Td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{nameOf(r.code)}</Td>
                                        )}
                                        <Td style={{ textAlign: "right", color: "var(--text-secondary)" }}>{r.amount === null ? "—" : fmtEok(r.amount)}</Td>
                                        {groupCols.map((c) => (
                                            <Td key={c.setId} style={{ textAlign: "center" }}>
                                                {c.state.kind === "loading" ? <span style={{ color: "var(--text-tertiary)" }}>…</span>
                                                    : c.state.kind === "unknown" ? <span style={{ color: "var(--text-tertiary)" }} title={c.state.why}>—</span>
                                                    : c.state.member.has(cellKeyOf(r.code, r.min))
                                                        ? <span style={{ color: c.color }}>●</span>
                                                        : <span style={{ color: "var(--border-strong)" }}>·</span>}
                                            </Td>
                                        ))}
                                    </tr>
                                    </FragmentRow>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {menuAt !== null && (
                <GroupMenu anchor={menuAt} pickedIds={picked} groupSets={groupSets} savedSets={savedSets} nameOf={groupName}
                    onPick={setPicked} onClose={() => setMenuAt(null)} />
            )}
        </div>
    );
}

/** 머리줄(있으면)과 본 줄을 한 키 아래 묶는 조각 — tbody 직계는 tr 이어야 해서 Fragment 로 잇는다. */
const FragmentRow = ({ head, children }: { head: React.ReactNode; children: React.ReactNode }): JSX.Element => (
    <>
        {head}
        {children}
    </>
);

const thBase: React.CSSProperties = {
    position: "sticky", top: 0, zIndex: 1, background: "var(--bg-primary)", fontSize: 10, fontWeight: 400,
    color: "var(--text-tertiary)", textAlign: "left", padding: "3px 8px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap",
};
const Th = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }): JSX.Element =>
    <th style={{ ...thBase, ...style }}>{children}</th>;
const Td = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }): JSX.Element =>
    <td style={{ padding: "2px 8px", borderBottom: "0.5px solid var(--border-subtle)", ...style }}>{children}</td>;
const navBtn: React.CSSProperties = {
    border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-primary)", fontSize: 11, padding: "0 2px",
};

/**
 * 조건 그룹 고르기 — 하루 저장 집합 목록에 ✓ 토글(상한 5). 「자동」 = 보는 집합의 최상위 부품을 따라간다
 * (집합을 바꾸면 열도 따라 바뀐다). 손으로 하나라도 고르면 그 목록으로 굳는다.
 */
function GroupMenu({ anchor, pickedIds, groupSets, savedSets, nameOf, onPick, onClose }: {
    anchor: { x: number; y: number };
    pickedIds: string[] | null;
    groupSets: readonly { id: string }[];
    savedSets: readonly { id: string; name?: string; universe: string }[];
    nameOf: (id: string) => string;
    onPick: (next: string[] | null) => void;
    onClose: () => void;
}): JSX.Element {
    const daily = savedSets.filter((f) => f.universe === "daily");
    // 지워진 집합 id 는 세지 않는다 — 유령이 상한 5를 채우면 더 고를 수도, 뺄 수도 없다(리뷰가 잡은 자리).
    // 토글 한 번이 걸러진 목록으로 다시 쓰므로 유령은 그때 자연히 청소된다.
    const current = (pickedIds ?? groupSets.map((f) => f.id)).filter((id) => daily.some((f) => f.id === id));
    // 손 이름 먼저, 자동 이름(묶음)은 흐리게 뒤로 — 집합 목록 판과 같은 결.
    const sorted = [...daily].sort((a, b) => Number(a.name === undefined) - Number(b.name === undefined));
    const row: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", border: "none", background: "transparent",
        cursor: "pointer", font: "inherit", fontSize: 11.5, padding: "4px 10px", color: "var(--text-primary)",
    };
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} width={230} padding={0} placement="beside" offset={6}>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: "3px 0" }}>
                <button onClick={() => onPick(null)} style={row}
                    title="보는 집합의 최상위 부품(참조 항)을 그대로 따라간다 — 집합을 바꾸면 열도 바뀐다">
                    <Check on={pickedIds === null} />자동 — 보는 집합의 부품
                </button>
                <div style={{ borderTop: "0.5px solid var(--border-subtle)", margin: "3px 0" }} />
                {sorted.length === 0 && <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-tertiary)" }}>하루 집합이 없습니다</div>}
                {sorted.map((f) => {
                    const on = current.includes(f.id);
                    const full = !on && current.length >= MAX_GROUPS;
                    return (
                        <button key={f.id} disabled={full}
                            onClick={() => onPick(on ? current.filter((x) => x !== f.id) : [...current, f.id])}
                            title={full ? `최대 ${MAX_GROUPS}개 — 하나를 빼야 더 고를 수 있습니다` : on ? "열에서 빼기" : "열로 세우기"}
                            style={{ ...row, color: full ? "var(--text-tertiary)" : f.name === undefined ? "var(--text-tertiary)" : "var(--text-primary)" }}>
                            <Check on={on} />
                            <span style={{ color: full ? undefined : PIN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(f.id)}</span>
                        </button>
                    );
                })}
            </div>
        </AnchoredPopover>
    );
}
const Check = ({ on }: { on: boolean }): JSX.Element =>
    <span style={{ width: 10, flexShrink: 0, color: "var(--accent-primary)", fontSize: 11 }}>{on ? "✓" : ""}</span>;
