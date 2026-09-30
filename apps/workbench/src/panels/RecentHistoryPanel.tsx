import { useEffect, useRef } from "react";
import { useWorkbench } from "../store/workbench.js";
import { useStockNames } from "../lib/useStockNames.js";
import { weekdayOf } from "../lib/date.js";
import { usePanelHeader } from "../components/header/registry.js";

// 최근 탐색 패널 — 세션 방문기록(EOD)을 최신순 flat 목록으로. focus 초크포인트가 기록하므로 워크셋·가설·차트·보드 어디서 이동하든 모임.
// 단위 = (날짜,종목) 1행 + 마지막 방문 시각. 행 클릭 = 그 시각으로(time 있으면 goToPoint / 없으면 setFocus) 되돌아가기.
function fmtDate(date: string): string {
    return `${date.slice(5).replace("-", ".")} (${weekdayOf(date)})`;
}

export function RecentHistoryPanel({ panelId }: { panelId: string }): JSX.Element {
    const history = useWorkbench((s) => s.history);
    const historyCursor = useWorkbench((s) => s.historyCursor);
    const clearHistory = useWorkbench((s) => s.clearHistory);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);

    // 헤더 선언 — 기록 수는 탭 칩 기본(짧고 tabular — 헤더 라인이 0줄이 된다), 비우기는 모음 판.
    usePanelHeader(panelId, {
        info: [
            { id: "count", name: "기록 수", tabular: true, defaultPlace: "tab", help: "세션 탐색 기록 수", text: () => `${history.length}` },
        ],
        controls: [
            {
                kind: "action", id: "clear", name: "기록 비우기", disabled: history.length === 0,
                help: "탐색 기록 비우기", run: () => { clearHistory(); return "탐색 기록 비움"; },
            },
        ],
    });

    // Alt+W/S 순환 시 커서 행이 항상 보이도록 스크롤. block:"nearest" 라 이미 보이면 안 움직임.
    const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    useEffect(() => {
        const e = historyCursor >= 0 ? history[historyCursor] : undefined;
        if (e) rowRefs.current.get(`${e.date}|${e.code}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [historyCursor, history]);

    // 종목명 — 사전 한 벌(전량)에서.
    const { nameOf } = useStockNames();

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            <div style={{ overflowY: "auto", flex: 1 }}>
                {history.length === 0 && <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>아직 탐색 기록 없음</div>}
                {history.map((e) => {
                    const selected = e.code === focusCode && e.date === focusDate;
                    return (
                        <button
                            key={`${e.date}|${e.code}`}
                            ref={(el) => {
                                const k = `${e.date}|${e.code}`;
                                if (el) rowRefs.current.set(k, el);
                                else rowRefs.current.delete(k);
                            }}
                            onClick={() => (e.time ? goToPoint({ date: e.date, code: e.code, time: e.time }) : setFocus({ date: e.date, code: e.code, time: null }))}
                            title="이 탐색으로 이동"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                textAlign: "left",
                                border: "none",
                                borderLeft: `3px solid ${selected ? "var(--accent-hover)" : "transparent"}`,
                                borderBottom: "1px solid var(--border-subtle)",
                                padding: "4px 10px",
                                cursor: "pointer",
                                font: "inherit",
                                background: selected ? "var(--accent-soft)" : "transparent",
                            }}
                        >
                            <Name name={nameOf(e.code)} code={e.code} strong={selected} />
                            <span className="tabular" style={{ flexShrink: 0, marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
                                {fmtDate(e.date)}{e.time ? ` · ${e.time.slice(0, 5)}` : ""}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** 종목 이름 한 칸(옛 WorksetRows 에서 이사 — 유일한 소비자가 여기다). */
function Name({ name, code, color, strong }: { name: string | null; code: string; color?: string; strong?: boolean }): JSX.Element {
    return (
        <span style={{ minWidth: 0, color: color ?? "var(--text-primary)", fontWeight: strong ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name ?? code}
        </span>
    );
}
