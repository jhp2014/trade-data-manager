// 기록 판 — 화면 둘을 한 판(화면 가운데)에서 넘긴다: 토큰 기록(붙여넣은 상태 토큰, 이 파일) · 탐색 기록(본 종목·날짜, shell/VisitHistory).
// 여닫기·넘기기 = Tab(커맨드 app.history — 닫힘 → 토큰 → 탐색 → 닫힘) · 경로 줄 「기록」 버튼(닫혀 있으면 토큰, 열려 있으면 닫기) ·
// 판 머리의 화면 이름 · Esc · 바깥 클릭. (옛 경로 우클릭 판의 「기록」·「다른 경로 가져오기」는 2026-11-18 은퇴 — 기록은 여기로.)
// 열린 동안 w/s(고르기)·Space(열기)는 **판의 것** — 판 안 키 처리라 커맨드 목록에 없고, 창(window) 캡처 단계에서 받아
// 전역 디스패처보다 먼저 먹는다(같은 키가 전역 커맨드 — w/s 순회 — 여도 판이 열린 동안은 판이 이긴다). 입력칸 포커스면 쉰다.
// 열기는 활성 경로에 쓰고 판은 열린 채, 기록 순서도 그대로 — 차례로 훑게.
// 토큰 기록 줄 높이는 다 같다: 이름 줄 + 선 칸 셋 한 줄(고정 폭 — 「26/01/07 (35일)」). 선은 먼 것부터,
// 거래일 수는 거래일 달력으로(종목 데이터 없이 — 판은 시세를 받지 않는다). 구간(▲▼)·% 는 안 보인다(% 는 차트의 선 위에).
import { useEffect, useMemo, useRef, useState } from "react";
import { lineCells, lineRef, parseStateToken, type DailyLine, type ParsedState } from "../lib/stateToken.js";
import { dateLabel } from "../lib/date.js";
import { useStockNameOf, useTradingDays } from "../market/queries.js";
import { usePaths, type Situation } from "../store/paths.js";
import { useTokenHistory } from "../store/tokenHistory.js";
import { useConfirm } from "../ui/ConfirmBar.js";
import { smallButton } from "../ui/chrome.js";
import { useUi, type HistoryView } from "../store/ui.js";
import { FloatingSurface } from "../ui/popover/FloatingSurface.js";
import { MENU_PAD } from "../ui/popover/menu.js";
import { reopenToken } from "./usePasteState.js";
import { VisitHistoryMenu } from "./VisitHistory.js";
import { MUTED, Note, useListKeys } from "./historyList.js";

/** 경로 줄의 입구 — 버튼 + 판. 열림·화면은 useUi 가 쥔다(Tab 이 버튼 없이도 열고 넘긴다). */
export function HistoryButton(): JSX.Element {
    const view = useUi((st) => st.historyView);
    const toggle = useUi((st) => st.toggleHistory);
    const close = useUi((st) => st.closeHistory);
    const anchorRef = useRef<HTMLDivElement>(null);
    return (
        <div ref={anchorRef} style={{ display: "inline-flex", flexShrink: 0 }}>
            <button
                title="기록 (Tab) — 토큰 기록 → 탐색 기록(Tab 으로 넘김), 골라 다시 연다"
                aria-label="기록"
                aria-expanded={view !== null}
                className="icon-btn"
                onClick={toggle}
                style={{ fontSize: 11.5, padding: "2px 6px", color: view !== null ? "var(--accent-primary)" : undefined }}
            >
                기록
            </button>
            {view !== null && (
                <FloatingSurface anchorRef={anchorRef} place={{ side: "below", align: "end", gap: 6 }} center onClose={close} layout="column" width={400} padding={0}>
                    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, padding: MENU_PAD }}>
                        <HistoryTabs view={view} />
                        {view === "token" ? <TokenHistoryMenu /> : <VisitHistoryMenu />}
                    </div>
                </FloatingSurface>
            )}
        </div>
    );
}

const VIEWS: { v: HistoryView; label: string }[] = [
    { v: "token", label: "토큰 기록" },
    { v: "visit", label: "탐색 기록" },
];

/** 판 머리 — 지금 화면만 진하게(Tab 이 무엇으로 넘어갔는지 바로 보이게). 이름을 눌러도 넘어간다. */
function HistoryTabs({ view }: { view: HistoryView }): JSX.Element {
    const setView = useUi((st) => st.setHistoryView);
    return (
        <div data-history-tabs="" style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "4px 12px" }}>
            {VIEWS.map(({ v, label }) => (
                <button
                    key={v}
                    aria-pressed={v === view}
                    onClick={() => setView(v)}
                    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 11.5, fontWeight: v === view ? 700 : 400, color: v === view ? "var(--text-primary)" : "var(--text-3)" }}
                >
                    {label}
                </button>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ ...MUTED, fontSize: 10.5 }}>Tab 넘기기 · Esc 닫기</span>
        </div>
    );
}

/**
 * 활성 경로가 지금 이 토큰의 상태인가 — 종목·날짜·선(집합 — 경로는 그은 순서, 토큰은 가격순)·구간, 시각 꼴이면 시각도.
 * 구간 k 는 양쪽 다 가격순이라(복사 판 · 토큰) 그대로 견준다.
 */
function isHere(s: Situation | undefined, t: ParsedState): boolean {
    if (!s || s.code !== t.code || s.date !== t.date) return false;
    if (t.time && s.time !== t.time) return false;
    const refs = (ls: readonly DailyLine[]): string => ls.map(lineRef).sort().join(",");
    if (refs(s.lines) !== refs(t.lines)) return false;
    return t.lines.length === 0 || s.zone === t.zone;
}

function TokenHistoryMenu(): JSX.Element {
    const entries = useTokenHistory((st) => st.entries);
    const remove = useTokenHistory((st) => st.remove);
    const clear = useTokenHistory((st) => st.clear);
    const confirm = useConfirm();
    const nameOf = useStockNameOf();
    const tradingDays = useTradingDays().data;
    const dayIndex = useMemo(() => new Map((tradingDays ?? []).map((d, i) => [d, i])), [tradingDays]);
    const activeS = usePaths((st) => st.paths.find((p) => p.id === st.active)?.s);
    // 고른 줄은 자리가 아니라 토큰 글자로 쥔다 — 위 줄을 지워도 고른 토큰이 그대로다. 처음엔 지금 열린 토큰(●), 없으면(·지움) 맨 위.
    const [picked, setPicked] = useState<string | null>(() => {
        const s = usePaths.getState().paths.find((p) => p.id === usePaths.getState().active)?.s;
        return useTokenHistory.getState().entries.find((e) => {
            const t = parseStateToken(e.token);
            return !!t && isHere(s, t);
        })?.token ?? null;
    });
    // 판이 열린 채 붙여넣으면(같은 글을 다시 붙여도) 맨 위(방금 연 토큰)로. 붙여넣기 = 맨 위 줄이 전에 없던 객체
    // (push 는 늘 새 객체를 쓰고, 지우기는 남은 객체를 그대로 둔다 — 맨 위 줄을 지워도 고른 줄은 그대로).
    const prevEntries = useRef(entries);
    useEffect(() => {
        if (entries[0] && !prevEntries.current.includes(entries[0])) setPicked(null);
        prevEntries.current = entries;
    }, [entries]);
    const cur = Math.max(0, entries.findIndex((e) => e.token === picked));
    const rows = useRef<(HTMLDivElement | null)[]>([]);

    // 본문을 중괄호로 — scrollIntoView 가 Promise 를 돌려주는 브라우저가 있어, 그대로 돌려주면 React 가 정리 함수로 부르다 죽는다.
    useEffect(() => {
        rows.current[cur]?.scrollIntoView({ block: "nearest" });
    }, [cur]);

    useListKeys(
        entries.length,
        cur,
        (i) => setPicked(entries[i].token),
        (i) => reopenToken(entries[i].token),
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {entries.length === 0 ? (
                <Note style={{ padding: "3px 12px 6px" }}>입력칸 밖에서 토큰이 든 글을 붙여넣으면(Ctrl+V) 글 속 토큰이 전부 여기에 쌓인다.</Note>
            ) : (
                <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 420 }}>
                    {entries.map((e, i) => {
                        const t = parseStateToken(e.token);
                        const here = !!t && isHere(activeS, t);
                        return (
                            <div
                                key={e.token}
                                ref={(el) => void (rows.current[i] = el)}
                                className="menu-item history-row"
                                role="menuitem"
                                data-token={e.token}
                                {...(i === cur ? { "data-selected": "" } : {})}
                                title={`${e.token}\n누르면(Space) 활성 경로를 이 상태로`}
                                onClick={() => {
                                    setPicked(e.token);
                                    reopenToken(e.token);
                                }}
                                style={{ display: "flex", flexDirection: "column", gap: 1, margin: "0 4px", padding: "4px 8px", borderRadius: 5, fontSize: 11.5, cursor: "pointer" }}
                            >
                                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                    <span aria-hidden style={{ width: 8, flexShrink: 0, fontSize: 8, color: "var(--accent-primary)" }}>{here ? "●" : ""}</span>
                                    {t ? (
                                        <>
                                            <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(t.code) ?? t.code}</span>
                                            <span className="tabular" style={MUTED}>{t.code}</span>
                                            <span style={{ flex: 1 }} />
                                            <span className="tabular" style={{ color: "var(--text-2)", flexShrink: 0 }}>
                                                {dateLabel(t.date)}
                                                {t.time && t.lines.length > 0 && ` ${t.time}`}
                                            </span>
                                        </>
                                    ) : (
                                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.token}</span>
                                    )}
                                    <button
                                        className="history-x"
                                        title="이 기록 지우기"
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            remove(e.token);
                                        }}
                                        style={{ border: "none", background: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                                    >
                                        ×
                                    </button>
                                </div>
                                <LineCells t={t} dayIndex={dayIndex} />
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid var(--border)", marginTop: 4, padding: "4px 8px 2px 12px", minHeight: 24 }}>
                {confirm.bar("clear") ?? (
                    <>
                        <Note style={{ flex: 1, fontSize: 10.5 }}>붙여넣은 토큰 · 최신순 — w/s 고르기 · Space 다시 열기</Note>
                        {entries.length > 0 && (
                            <button style={{ ...smallButton, fontSize: 10.5 }} onClick={() => confirm.ask("clear", `토큰 기록 ${entries.length}줄을 전부 지울까?`, "전체 지우기", clear)}>
                                전체 지우기
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const CELL_LINE = 16;

/** 선 칸 셋 한 줄 — 칸 폭·줄 높이는 선이 몇 개든(없어도) 같다. 칸 = 「26/01/07 (35일)」(+덧말). */
function LineCells({ t, dayIndex }: { t: ParsedState | null; dayIndex: ReadonlyMap<string, number> }): JSX.Element {
    const cells = t ? lineCells(t, dayIndex) : [];
    // 시각만인 토큰은 시각, 선이 있으면 선 칸(시각은 날짜 옆에)
    const empty = !t ? "" : cells.length > 0 ? null : t.time ? t.time : "선 없음";
    return (
        <div className="tabular" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: 8, paddingLeft: 14, lineHeight: `${CELL_LINE}px`, height: CELL_LINE }}>
            {empty !== null ? (
                <span style={{ ...MUTED, gridColumn: "1 / -1" }}>{empty}</span>
            ) : (
                cells.map((c) => (
                    <div key={c.ref} style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-2)" }}>
                        {c.date}
                        {c.days !== null && <span style={MUTED}>{` (${c.days}일)`}</span>}
                        {c.extra && <span style={{ ...MUTED, fontSize: 10.5 }}> {c.extra}</span>}
                    </div>
                ))
            )}
        </div>
    );
}
