// 일별 타점 [탐색] — 하루 후보를 **날짜 단위로 걷는** 전용 뷰(2026-09-26 · 09-27 옛 작업 대상의 손을 승계).
// 행 = 보는 집합의 그날 후보(기본 **종목순** — 종목 머리줄(이름 + 테마) 아래 들여쓴 시간순, 토글로 시간순),
// 열 = **조건 그룹**(고른 저장 집합 ≤10)의 통과 ●/· — 번호 열 ①~⑩ 이 **시간 반대편(오른쪽)** 에 붙고, 이름은
// 위쪽 범례 줄이 말한다(열 머리에 이름을 세우면 폭·머리 높이를 먹는다). 폭이 모자라면 시간 열 고정 가로 스크롤.
// "어느 조건 덕에 나왔나"는 조건판이 아니라 이 뷰의 책임이다(사용자 확정).
//
// · 날짜 넘기 = useDayCrossing — 목록 끝 w/s·◀▶ 로 이전/다음 거래일, 빈 날 스킵,
//   「날짜 고정」으로 잠금.
// · 조건 그룹 = 저장 집합 그 자체(새 저장물 없음). 그룹마다 그날 평가 한 벌 — 훅 규칙 때문에 **고정 10칸**으로
//   부르고, 평가 예산(useCellSet `budgeted` — 한 태스크 한 벌)을 따라 한 프레임에 한 벌씩 선다. 캐시 선반 16칸이라 첫 방문 뒤엔 공짜다.
// · 잘리거나(그물) 오류인 그룹은 열 전체 "—" — 모름을 통과/탈락으로 찍지 않는다(exploreRows.groupColStateOf).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataDatesQuery } from "../../api/queries.js";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { RowNavBadge } from "../../components/RowNavBadge.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { usePublishRowNav } from "../../lib/rowNav.js";
import { useDayReplayPrefetch } from "../../lib/useDaySnapshot.js";
import { useDock } from "../../store/dock.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { AnchoredPopover } from "../../ui/Dialog.js";
import { MENU_PAD, MenuItem, MenuSep } from "../../ui/popover/menu.js";
import { PIN } from "../../styles/palette.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { DAY_SET_OPTS, useCellSet } from "../filter/useCellSet.js";
import { deepLeavesOf } from "../filter/expr.js";
import { isHeavyCellPredicate } from "../filter/stage.js";
import { useGroupAssign } from "../../store/groupAssign.js";
import { neighborDates } from "./dayCrossing.js";
import { useDayCrossing } from "./useDayCrossing.js";
import { stepWithin, type NavKey } from "./walk.js";
import { MAX_GROUPS, cellKeyOf, exploreRowsOf, type ExploreSort } from "./exploreRows.js";
import { FragmentRow, GroupLegend, NAME_W, TIME_W, TREE_INDENT, Td, Th, ThemeChips, dotCell, HeadLine, headLineCell, navBtn, scrollBox, stickL, thBase, treeTimeCell } from "./exploreTable.js";
import { useConditionGroups, type GroupCol } from "./useConditionGroups.js";

const EMPTY_DATES: string[] = [];
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function DailyExplorePanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    // 탭 제목 = 카탈로그 이름 — 옛 저장 배치의 「일별 타점[탐색]」을 되돌린다(생성판 선례).
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    const funnel = useFunnel();
    const { nameOf } = useStockNamesDict();
    const themeIndex = useThemeIndex().index;
    const isDaily = true;
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusTime = useWorkbench((s) => s.focus.time);
    const savedSets = useWorkbench((s) => s.savedSets);

    // ── 보는 집합의 그날 후보 — 차트 ◇ 와 같은 평가·같은 상한(300).
    const cellSet = useCellSet(isDaily ? funnel.slowExpr : null, funnel.slowSets, focusDate, DAY_SET_OPTS);
    // 기본 = 종목순(종목 안 시간순) — 대부분 종목 단위로 걷는다(사용자 확정). 순회(w/s)도 이 순서 그대로다.
    const [sortMode, setSortMode] = usePanelUi<ExploreSort>(panelId, "sortMode", "stock");
    const rows = useMemo(
        () => (cellSet.tooWide ? [] : exploreRowsOf(cellSet.hits, sortMode)),
        [cellSet.tooWide, cellSet.hits, sortMode],
    );

    // ── 조건 그룹 — 선택·평가는 useConditionGroups 한 벌(기본 차트 고스트 칩과 공유).
    // ⚠ 행이 없는 날(빈 날·로딩·잘림)엔 그룹도 안 돈다 — 자동 스킵이 지나는 날마다 그룹 평가를 물지 않게.
    // ── 좁히기 — 열 머리 클릭 = 그 그룹 통과 행만(다시 = 해제). 세션 상태(시선이지 저장물이 아니다).
    //    좁힌 그룹은 **평가 예산의 우선 그룹**이다 — 행과 같은 렌더에 서야 날짜 넘기기 착지가 좁힌 목록을 본다.
    const [narrowId, setNarrowId] = useState<string | null>(null);
    const { picked, setPicked, groupSets, groupCols, groupName } = useConditionGroups(focusDate, isDaily && rows.length > 0, narrowId);
    const narrowCol = groupCols.find((c) => c.setId === narrowId);
    // 그룹이 목록에서 빠지면 좁히기도 풀린다 — 안 풀면 "아무 열도 강조 안 됐는데 행이 줄어 있는" 상태가 남는다.
    useEffect(() => { if (narrowId !== null && !groupCols.some((c) => c.setId === narrowId)) setNarrowId(null); }, [narrowId, groupCols]);
    /** 좁히기 토글 — 열 머리·범례가 같은 손. 모르는 그룹(… / —)으로는 좁히지 않는다. */
    const toggleNarrow = (c: GroupCol): void => { if (c.state.kind === "ready") setNarrowId((v) => (v === c.setId ? null : c.setId)); };
    const [legendOpen, setLegendOpen] = usePanelUi<boolean>(panelId, "legendOpen", true);
    const shownRows = useMemo(() => {
        if (!narrowCol || narrowCol.state.kind !== "ready") return rows;
        const m = narrowCol.state.member;
        return rows.filter((r) => m.has(cellKeyOf(r.code, r.min)));
    }, [rows, narrowCol]);

    /** 그룹 배정 — 종목 머리줄 우클릭 = 하루 그룹(차트), 행 우클릭 = 타점 그룹(좌표). */
    const openAssign = (ev: React.MouseEvent, code: string, time?: string): void => {
        ev.preventDefault();
        useGroupAssign.getState().open({ stockCode: code, name: nameOf(code), date: focusDate, ...(time !== undefined ? { time } : {}) }, { x: ev.clientX, y: ev.clientY });
    };

    // ── 날짜 넘기 — ◀▶ 도 w/s 경계와 같은 손(빈 날 스킵·고정·상한이 한 규칙).
    const datesQ = useQuery({ ...dataDatesQuery(), enabled: isDaily });
    const [datePinned, setDatePinned] = usePanelUi<boolean>(panelId, "datePin", false);
    useDayReplayPrefetch(isDaily ? focusDate : null, useMemo(() => neighborDates(datesQ.data ?? EMPTY_DATES, focusDate), [datesQ.data, focusDate]));
    // 무거운 조건(돌파 사슬·테마 분 단면)이면 빈 날 스킵 상한이 줄어든다 — 묶음 속 조건도 평가에선 돈다.
    const heavy = useMemo(
        () => cellSet.stages.some((st) => st.counted)
            && deepLeavesOf(funnel.slowExpr, (id) => funnel.slowSets.find((f) => f.id === id)?.expr)
                .some(({ stage: st }) => st.enabled && st.predicates.some(isHeavyCellPredicate)),
        [cellSet.stages, funnel.slowExpr, funnel.slowSets],
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
        // 좁힌 열이 아직 모름(…)이면 행 수·착지가 좁히기 전 목록을 본다 — 설 때까지 기다린다.
        ready: isDaily && !cellSet.isLoading && narrowCol?.state.kind !== "loading",
        failed: cellSet.error !== null,
        count: order.length,
        heavy,
        pinned: datePinned,
        truncated: cellSet.truncated,
        onLand: landOn,
        origin: "explore-cross",
    });
    const canCross = isDaily && !cellSet.isLoading && !cellSet.tooWide && cellSet.error === null && !crossing.seeking;

    // ── w/s 순회 — 커서 = focus 그대로(하루 우주의 행은 좌표다).
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
            help: `열로 세울 조건 그룹(저장 집합) 고르기 — 최대 ${MAX_GROUPS}개. 기본은 보는 집합의 최상위 부품`,
            run: (at) => setMenuAt((v) => (v === null ? { x: at.clientX, y: at.clientY } : null)),
        },
    ], [sortMode, setSortMode, datePinned, setDatePinned, groupCols.length, menuAt]);

    // ── 포커스 행 따라가기 — 걷는 행이 화면 밖으로 나가지 않게.
    const focusRowRef = useRef<HTMLTableRowElement | null>(null);
    useEffect(() => { focusRowRef.current?.scrollIntoView({ block: "nearest" }); }, [focusCode, focusTime]);

    const note = !isDaily ? "하루 모드에서만 섭니다"
        : cellSet.error !== null ? `재료 조회 실패 — ${cellSet.error.message}`
        : !cellSet.evaluable ? "평가할 조건이 없습니다 — 조건판에서 조건을 거세요"
        : cellSet.tooWide ? `${cellSet.matched.toLocaleString("ko-KR")}+ 너무 넓음 — 조건을 좁히세요`
        : cellSet.isLoading || !cellSet.ready ? "불러오는 중…"
        : rows.length === 0 ? "이 날은 후보가 없습니다"
        : null;
    const weekday = WEEKDAY[new Date(`${focusDate}T00:00:00`).getDay()] ?? "";
    // 종목순 = 트리(머리줄 + 들여쓴 시간, 괘선 없음) · 시간순 = 평탄한 표(괘선 유지 — 묶음이 없어 줄이 행을 가른다).
    const tree = sortMode === "stock";
    const timeW = tree ? TIME_W + TREE_INDENT : TIME_W;
    const noLine: React.CSSProperties | undefined = tree ? { borderBottom: "none" } : undefined;

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

            {/* 범례 줄 — 번호 열의 이름표. 클릭 = 열 머리와 같은 좁히기. 접으면 번호만 한 줄. */}
            {isDaily && (
                <GroupLegend open={legendOpen} onToggleOpen={() => setLegendOpen((v) => !v)} narrowKey={narrowId}
                    empty="열로 세울 조건 그룹이 없습니다 — 머리의 「조건 그룹」에서 고르세요"
                    onNarrow={(key) => { const c = groupCols.find((x) => x.setId === key); if (c) toggleNarrow(c); }}
                    cols={groupCols.map((c) => ({
                        key: c.setId, num: c.num, name: c.name, color: c.color, title: colTitle(c),
                        clickable: c.state.kind === "ready", dim: c.state.kind === "unknown",
                        ...(c.state.kind === "loading" ? { suffix: " …" } : {}),
                    }))} />
            )}

            {/* 세로·가로 스크롤 한 상자 — 머리는 위에, 시간(·종목) 열은 왼쪽에 붙는다. */}
            <div style={scrollBox}>
                {note !== null ? (
                    <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>{note}</div>
                ) : (
                    <table className="tabular" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                        <thead>
                            <tr>
                                {/* 종목순에선 머리줄이 묶음을 말하므로 「시간」 글자는 할 말이 없다 — 칸(폭)만 둔다. */}
                                <Th style={{ ...stickL(0), zIndex: 3, width: timeW, minWidth: timeW }}>{tree ? "" : "시간"}</Th>
                                {sortMode === "time" && <Th style={{ ...stickL(TIME_W), zIndex: 3, width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W }}>종목</Th>}
                                {/* 빈 칸이 남는 폭을 다 먹어 번호 열을 **시간 반대편**으로 민다(사용자 확정). */}
                                <th style={{ ...thBase, width: "100%" }} />
                                {groupCols.map((c) => (
                                    <th key={c.setId} title={colTitle(c)} onClick={() => toggleNarrow(c)}
                                        style={{ ...thBase, ...dotCell, fontSize: 11, cursor: c.state.kind === "ready" ? "pointer" : "default",
                                            color: c.state.kind === "unknown" ? "var(--text-tertiary)" : c.color,
                                            borderBottom: narrowId === c.setId ? `2px solid ${c.color}` : thBase.borderBottom }}>
                                        {c.num}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shownRows.map((r, i) => {
                                const isFocus = r.code === focusCode && r.time === focusTime;
                                // 종목순일 때만 종목 머리줄 — 이름 + 테마(앞 THEME_SHOW 개, 나머지 +N). 클릭 = 그 종목 첫 타점 ·
                                // 우클릭 = 하루 그룹 배정(차트). 묶음 경계는 **이름 뒤 가는 선** 하나다(칸 배경에 그린 1px 가로선을
                                // 이름 덩어리가 제 배경으로 덮는다 — 가로 스크롤 중에도 이름이 왼쪽에 붙어 있게 덩어리만 sticky). 덩어리는 보이는 폭(100cqw)만
                                // 차지해 표 폭을 안 먹는다 — 넘치면 테마 끝에서 자른다(HeadLine).
                                const head = tree && (i === 0 || shownRows[i - 1]!.code !== r.code) ? (
                                    <tr key={`head-${r.code}`}>
                                        <td colSpan={2 + groupCols.length} style={{ ...headLineCell, paddingTop: i === 0 ? 2 : 6 }}>
                                            <HeadLine onContextMenu={(ev) => openAssign(ev, r.code)}>
                                                <button onClick={() => useWorkbench.getState().goToPoint({ date: focusDate, code: r.code, time: r.time }, "daily-explore")}
                                                    className="row-self-marked"
                                                    title="좌클릭 = 이 종목의 첫 타점으로 · 우클릭 = 그룹 배정(하루)"
                                                    style={{ border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, padding: 0, color: "var(--text-primary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                                                    {nameOf(r.code)}
                                                </button>
                                                <ThemeChips themes={themeIndex.themesOf(r.code)} />
                                            </HeadLine>
                                        </td>
                                    </tr>
                                ) : null;
                                const rowBg = isFocus ? "var(--accent-soft)" : "var(--bg-primary)";
                                return (
                                    <FragmentRow key={cellKeyOf(r.code, r.min)} head={head}>
                                    <tr ref={isFocus ? focusRowRef : undefined}
                                        onClick={() => useWorkbench.getState().goToPoint({ date: focusDate, code: r.code, time: r.time }, "daily-explore")}
                                        onContextMenu={(ev) => openAssign(ev, r.code, r.time)}
                                        title="좌클릭 = 이 타점으로 시선 이동(차트가 따라온다) · 우클릭 = 그룹 배정(좌표 라벨)"
                                        style={{ cursor: "pointer", background: rowBg }}>
                                        {/* 붙는 칸은 제 배경을 칠해야 밀려 지나가는 점 열을 가린다. 종목순 = 가이드선 안쪽으로 들여쓴다. */}
                                        {/* paddingLeft 는 두 모드 다 **항상** 준다 — 한쪽에만 두면 모드 전환 때 React 가 그 키를 지우며 Td 의 padding(shorthand)
                                            왼쪽까지 날린다(같은 td 가 재사용된다 — 키가 정렬과 무관). */}
                                        <Td style={{ ...stickL(0), backgroundColor: rowBg, paddingLeft: tree ? 8 + TREE_INDENT : 8, ...noLine, ...(tree ? treeTimeCell(isFocus) : null) }}>{r.time.slice(0, 5)}</Td>
                                        {/* 종목순에선 열 자체를 접는다 — 머리줄이 이름을 말하는데 빈 열이 폭만 먹는다. */}
                                        {sortMode === "time" && (
                                            <Td style={{ ...stickL(TIME_W), background: rowBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: NAME_W }}>{nameOf(r.code)}</Td>
                                        )}
                                        <Td style={noLine} />
                                        {groupCols.map((c) => (
                                            <Td key={c.setId} style={{ ...dotCell, ...noLine }}>
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

/** 열 머리·범례 hover — 이름·그날 통과 수·상태. */
const colTitle = (c: GroupCol): string => `${c.num} ${c.name}${c.state.kind === "ready"
    ? ` — 그날 통과 ${c.state.member.size.toLocaleString("ko-KR")}\n클릭 = 이 그룹 통과 행만(다시 = 해제)`
    : c.state.kind === "loading" ? " — 계산 중" : ` — ${c.state.why}`}`;


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
    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} width={230} padding={0} placement="beside" offset={6}>
            <div style={{ maxHeight: 300, overflowY: "auto", padding: MENU_PAD }}>
                <MenuItem mark="check" on={pickedIds === null} onClick={() => onPick(null)}
                    title="보는 집합의 최상위 부품(참조 항)을 그대로 따라간다 — 집합을 바꾸면 열도 바뀐다">
                    자동 — 보는 집합의 부품
                </MenuItem>
                <MenuSep />
                {sorted.length === 0 && <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>하루 집합이 없습니다</div>}
                {sorted.map((f) => {
                    const on = current.includes(f.id);
                    const full = !on && current.length >= MAX_GROUPS;
                    return (
                        <MenuItem key={f.id} mark="check" on={on} disabled={full}
                            onClick={() => onPick(on ? current.filter((x) => x !== f.id) : [...current, f.id])}
                            why={`최대 ${MAX_GROUPS}개 — 하나를 빼야 더 고를 수 있습니다`}
                            title={on ? "열에서 빼기" : "열로 세우기"}>
                            <span style={{ color: full ? undefined : PIN }}>{nameOf(f.id)}</span>
                        </MenuItem>
                    );
                })}
            </div>
        </AnchoredPopover>
    );
}
