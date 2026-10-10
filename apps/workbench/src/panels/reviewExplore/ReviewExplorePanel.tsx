// 복기 노트 [탐색] — vault(trading-review) 의 타점 노트를 **날짜 단위로 걷는** 판(2026-10-10, decisions 「복기 노트 [탐색]」).
// 복기의 원본은 vault 노트이고 이 판은 **거울**이다 — 후보를 다시 계산하지 않는다(자동 후보마다 빈 노트가 먼저
// 생기므로 노트 목록 = 그날 볼 자리). 기록은 Obsidian 에서 하고, 돌아오면 창 포커스 재조회가 다시 읽는다. 읽기 전용.
//
// 골격은 일별 타점 [탐색]과 한 벌: 날짜 넘기(useDayCrossing — 노트 있는 날만) · 공용 달력 · w/s 책갈피(useWalkCursor) ·
// 종목순 트리(머리줄 = 이름 + 테마)/시간순. 조건 그룹 열 대신 **노트 칸**(상태 · 감 · 후보 · 메모 ✎ — 메모는 hover).
// `후보`(본/경계/없음)는 vault 가 기록이 끝난 뒤 채운다 — 그 전엔 비어 있어 가림이 저절로 지켜진다.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewNote } from "@trade-data-manager/wire";
import { dataDatesQuery, reviewNotesQuery } from "../../api/queries.js";
import { usePanelHeader } from "../../components/header/registry.js";
import { useRowNavControl } from "../../components/rowNavControl.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { usePublishRowNav } from "../../lib/rowNav.js";
import { useDock } from "../../store/dock.js";
import { useWorkbench } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { DateCalendar } from "../../ui/DateCalendar.js";
import { useDayCrossing } from "../dailyExplore/useDayCrossing.js";
import { stepWithin, type NavKey } from "../dailyExplore/walk.js";
import { useWalkCursor } from "../dailyExplore/useWalkCursor.js";
import { FragmentRow, flatCursorMark, HeadLine, NAME_W, TIME_W, TREE_INDENT, Td, Th, ThemeChips, headLineCell, revealRow, ScrollBox, stickL, thBase, treeTimeCell } from "../dailyExplore/exploreTable.js";
import { noteDatesOf, noteMonthsOf, rowsOn, unseenByDate, unseenOf, type ReviewRow, type ReviewSort } from "./reviewRows.js";

const EMPTY_NOTES: ReviewNote[] = [];
const EMPTY_DATES: string[] = [];
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;
const ORIGIN = "review-explore";

/** 노트 칸 폭 — 시간 반대편(오른쪽)에 붙는다(일별 판의 번호 열 자리). */
const COLS = [
    { key: "state", label: "상태", w: 40 },
    { key: "gam", label: "감", w: 48 },
    { key: "cand", label: "후보", w: 36 },
    { key: "memo", label: "메모", w: 32 },
] as const;
const colCell: React.CSSProperties = { textAlign: "center", padding: "2px 4px", whiteSpace: "nowrap" };

export function ReviewExplorePanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    // w/s 후보 자격 — **조기 반환보다 위에서**(아래 어디서도 반환하지 않지만, 자격이 깜빡이지 않게 맨 위).
    const navRef = usePublishRowNav(ORIGIN);

    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    const { nameOf } = useStockNamesDict();
    const themeIndex = useThemeIndex().index;
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusTime = useWorkbench((s) => s.focus.time);
    const qc = useQueryClient();

    const q = useQuery(reviewNotesQuery());
    const res = q.data;
    const notes = res?.vault === "ok" ? res.notes : EMPTY_NOTES;
    const noteDates = useMemo(() => (res?.vault === "ok" ? noteDatesOf(res.notes) : EMPTY_DATES), [res]);
    const noteMonths = useMemo(() => noteMonthsOf(noteDates), [noteDates]);
    const unseenMap = useMemo(() => unseenByDate(notes), [notes]);

    const [sortMode, setSortMode] = usePanelUi<ReviewSort>(panelId, "sortMode", "stock");
    const rows = useMemo(() => rowsOn(notes, focusDate, sortMode), [notes, focusDate, sortMode]);
    const dayNotes = useMemo(() => rows.flatMap((r) => r.notes), [rows]);
    const dupRows = rows.filter((r) => r.notes.length > 1).length;

    // ── 날짜 넘기 — 노트 있는 날만 걷는다(빈 날 스킵은 사실상 안 일어난다). 달력 클릭은 명시 선택이라 곧장.
    const datesQ = useQuery(dataDatesQuery()); // 달력의 휴장 판정 재료
    const [datePinned, setDatePinned] = usePanelUi<boolean>(panelId, "datePin", false);
    const order = useMemo<NavKey[]>(() => rows.map((r) => ({ code: r.code, date: r.date, time: r.time })), [rows]);
    const orderRef = useRef(order);
    orderRef.current = order;
    const focusCursor = useMemo(() => (focusTime !== null ? { code: focusCode, date: focusDate, time: focusTime } : null), [focusCode, focusDate, focusTime]);
    const walk = useWalkCursor({
        order, scope: focusDate, focus: focusCursor, fallback: stepWithin,
        go: (to) => useWorkbench.getState().goToPoint({ date: to.date, code: to.code, time: to.time ?? "" }, ORIGIN),
        onBoundary: (dir) => { if (canCross) crossing.cross(dir); },
    });
    const { jump } = walk;
    const landOn = useCallback((dir: 1 | -1) => {
        const o = orderRef.current;
        const to = dir > 0 ? o[0] : o[o.length - 1];
        if (to) jump(to);
    }, [jump]);
    const ok = res?.vault === "ok";
    const crossing = useDayCrossing({
        active: true,
        dates: noteDates,
        ready: q.isSuccess && ok,
        failed: q.isError || (q.isSuccess && !ok),
        count: order.length,
        heavy: false,
        pinned: datePinned,
        truncated: false,
        onLand: landOn,
        origin: ORIGIN,
    });
    const canCross = q.isSuccess && ok && !crossing.seeking;

    navRef.current = walk.step;
    const pos = walk.pos;
    const rowNavCtl = useRowNavControl(ORIGIN);

    const focusRowRef = useRef<HTMLTableRowElement | null>(null);
    const cur = walk.cursor;
    useEffect(() => { revealRow(focusRowRef.current); }, [cur?.code, cur?.date, cur?.time]);

    const note = q.isError ? `조회 실패 — ${q.error.message}`
        : !res ? "불러오는 중…"
        : res.vault === "unset" ? "VAULT_DIR 미설정 — apps/api/.env 에 VAULT_DIR(복기 저장소 루트)을 넣고 api 를 다시 띄우세요"
        : res.vault === "missing" ? `vault 경로를 읽을 수 없습니다 — ${res.why}`
        : res.notes.length === 0 ? "노트가 없습니다"
        : rows.length === 0 ? "이 날은 노트가 없습니다 — ‹ › 로 노트 있는 날로"
        : null;
    const issues = res?.vault === "ok" ? res.issues : [];
    const skipped = issues.filter((i) => i.skipped).length;
    const weekday = WEEKDAY[new Date(`${focusDate}T00:00:00`).getDay()] ?? "";
    const tree = sortMode === "stock";
    const timeW = tree ? TIME_W + TREE_INDENT : TIME_W;
    const noLine: React.CSSProperties | undefined = tree ? { borderBottom: "none" } : undefined;

    usePanelHeader(panelId, {
        info: [
            {
                id: "vault", name: "vault 경로",
                ...(res && res.vault !== "ok" ? { tone: "warn" as const } : {}),
                help: "api 의 VAULT_DIR(apps/api/.env — 셸 env 가 이긴다). 앱은 경로를 바꾸지 못한다",
                text: () => (!res ? null : res.vault === "ok" ? res.root : res.vault === "unset" ? "VAULT_DIR 미설정" : `경로 없음: ${res.root}`),
                defaultPlace: "bottom",
            },
            {
                id: "count", name: "노트·순회", tabular: true,
                help: `그날 노트 ${dayNotes.length} · 안 본 노트 ${unseenOf(dayNotes)}${dupRows > 0 ? ` · 같은 자리 노트 겹침 ${dupRows}곳` : ""} · ${pos !== null ? `순회 위치 ${pos}` : "커서 없음"}`,
                text: () => (rows.length === 0 ? null : `노트 ${dayNotes.length} · 안 봄 ${unseenOf(dayNotes)}${pos !== null ? ` · ${pos}/${rows.length}` : ""}`),
            },
            {
                id: "issues", name: "읽기 경고", tone: "warn",
                help: issues.length === 0 ? "읽다가 걸린 노트 없음" : issues.slice(0, 20).map((i) => `${i.skipped ? "버림" : "경고"} ${i.file} — ${i.why}`).join("\n"),
                text: () => (issues.length === 0 && dupRows === 0 ? null
                    : [skipped > 0 ? `못 읽은 노트 ${skipped}` : null, issues.length - skipped > 0 ? `칸 경고 ${issues.length - skipped}` : null, dupRows > 0 ? `겹침 ${dupRows}` : null].filter(Boolean).join(" · ")),
            },
            {
                id: "crossing", name: "날짜 넘김", transient: true,
                help: "날짜 넘기기의 일시 알림",
                text: () => (crossing.seeking ? "날짜 넘기는 중…" : crossing.note),
            },
        ],
        controls: [
            {
                kind: "stepper", id: "dateNav", name: "노트 날짜 이동", nav: true, width: 220,
                label: `${focusDate.slice(2).replaceAll("-", ".")} ${weekday}`,
                prev: () => { crossing.cross(-1); },
                next: () => { crossing.cross(1); },
                canPrev: !crossing.seeking,
                canNext: !crossing.seeking,
                prevHelp: "노트 있는 이전 날 — 날짜 고정 규칙(목록 처음에서 w 로도)",
                nextHelp: "노트 있는 다음 날 — 날짜 고정 규칙(목록 끝에서 s 로도)",
                help: "노트 있는 날로 점프 · 점 = 안 본 노트가 남은 날 · 흐린 날 = 다 본 날 · 빈 칸 = 노트 없음",
                renderPopover: (close) => (
                    <DateCalendar tradingDates={datesQ.data ?? EMPTY_DATES} current={focusDate} months={noteMonths}
                        canPick={(d) => unseenMap.has(d)}
                        markOf={(d) => { const u = unseenMap.get(d); return u === undefined ? "unknown" : u > 0 ? "has" : "zero"; }}
                        markHelp={{ has: "안 본 노트가 남은 날", zero: "다 본 날" }}
                        onPick={(d) => { useWorkbench.getState().setDate(d, ORIGIN); close(); }} />
                ),
            },
            rowNavCtl,
            {
                kind: "choice", id: "sort", name: "정렬", value: sortMode, set: (v) => setSortMode(v as ReviewSort),
                values: [{ v: "stock", label: "종목순" }, { v: "time", label: "시간순" }],
                help: "종목순 = 종목 머리줄 아래 시간순(기본) · 시간순 = 장 흐름대로 평탄",
            },
            {
                kind: "toggle", id: "datePin", name: "날짜 고정", on: datePinned,
                help: "목록 끝에서 w/s·‹› 가 날짜를 안 넘긴다 — '이 날만 보겠다'는 선언",
                set: () => setDatePinned((v) => !v),
            },
            {
                kind: "action", id: "refresh", name: "다시 읽기", label: "↻",
                help: "vault 노트를 지금 다시 읽는다(창으로 돌아오면 저절로도 읽는다)",
                run: () => { void qc.refetchQueries({ queryKey: reviewNotesQuery().queryKey }); return "노트 다시 읽는 중"; },
            },
        ],
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <ScrollBox>
                {note !== null ? (
                    <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>{note}</div>
                ) : (
                    <table className="tabular" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                        <thead>
                            <tr>
                                <Th style={{ ...stickL(0), zIndex: 3, width: timeW, minWidth: timeW }}>{tree ? "" : "시간"}</Th>
                                {sortMode === "time" && <Th style={{ ...stickL(TIME_W), zIndex: 3, width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W }}>종목</Th>}
                                <th style={{ ...thBase, width: "100%" }} />
                                {COLS.map((c) => <th key={c.key} style={{ ...thBase, ...colCell, width: c.w, minWidth: c.w, fontSize: 10.5, color: "var(--text-tertiary)", fontWeight: 400 }}>{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => {
                                const isCursor = cur !== null && r.code === cur.code && r.time === cur.time;
                                const isFocus = isCursor && !walk.drifted;
                                const head = tree && (i === 0 || rows[i - 1]!.code !== r.code) ? (
                                    <tr key={`head-${r.code}`} data-head="">
                                        <td colSpan={2 + COLS.length} style={{ ...headLineCell, paddingTop: i === 0 ? 2 : 6 }}>
                                            <HeadLine>
                                                <button onClick={() => jump({ date: r.date, code: r.code, time: r.time })}
                                                    className="row-self-marked" title="이 종목의 첫 노트로"
                                                    style={{ border: "none", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, padding: 0, color: "var(--text-primary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                                                    {displayName(r, nameOf)}
                                                </button>
                                                <ThemeChips themes={themeIndex.themesOf(r.code)} />
                                            </HeadLine>
                                        </td>
                                    </tr>
                                ) : null;
                                const rowBg = isFocus ? "var(--accent-soft)" : "var(--bg-primary)";
                                const n = r.notes[0]!;
                                return (
                                    <FragmentRow key={`${r.code}|${r.time}`} head={head}>
                                        <tr ref={isCursor ? focusRowRef : undefined}
                                            onClick={() => jump({ date: r.date, code: r.code, time: r.time })}
                                            title={rowTitle(r)}
                                            style={{ cursor: "pointer", background: rowBg }}>
                                            <Td style={{ ...stickL(0), backgroundColor: rowBg, paddingLeft: tree ? 8 + TREE_INDENT : 8, ...noLine, ...(tree ? treeTimeCell(isCursor) : isCursor ? flatCursorMark : null) }}>{r.time.slice(0, 5)}</Td>
                                            {sortMode === "time" && (
                                                <Td style={{ ...stickL(TIME_W), background: rowBg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: NAME_W }}>{displayName(r, nameOf)}</Td>
                                            )}
                                            <Td style={noLine} />
                                            <Td style={{ ...colCell, ...noLine }}>
                                                {n.state === null ? <span style={{ color: "var(--border-strong)" }}>·</span>
                                                    : <span style={{ color: n.state === "기록" ? "var(--text-primary)" : "var(--text-tertiary)" }}>{n.state}</span>}
                                                {r.notes.length > 1 && <span title={`같은 자리 노트 ${r.notes.length}장 — 첫 장을 보인다`} style={{ color: "var(--warning)", marginLeft: 2 }}>×{r.notes.length}</span>}
                                            </Td>
                                            <Td style={{ ...colCell, ...noLine, color: "var(--text-secondary)" }}>{n.gam ?? ""}</Td>
                                            <Td style={{ ...colCell, ...noLine, color: "var(--text-secondary)" }}>{n.candidate ?? ""}</Td>
                                            <Td style={{ ...colCell, ...noLine, color: "var(--text-tertiary)" }}>{n.hasMemo ? "✎" : ""}</Td>
                                        </tr>
                                    </FragmentRow>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </ScrollBox>
        </div>
    );
}

/** 이름 — 종목 마스터 우선, 없으면 노트의 종목 칸. */
function displayName(r: ReviewRow, nameOf: (code: string) => string): string {
    const m = nameOf(r.code);
    return m && m !== r.code ? m : r.notes[0]!.name ?? r.code;
}

/** 행 hover — 메모 앞부분(없으면 안내) + 파일 이름. */
function rowTitle(r: ReviewRow): string {
    const memo = r.notes.map((n) => n.memoHead).filter(Boolean).join("\n— — —\n");
    return `${memo || "(메모 없음)"}\n\n${r.notes.map((n) => n.id).join("\n")}\n클릭 = 이 자리로 시선 이동(차트가 따라온다)`;
}
