import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { stocksMetaQuery } from "../api/queries.js";
import { weekdayOf } from "../lib/date.js";
import { Name } from "./WorksetRows.js";

// 최근 탐색 패널 — 세션 방문기록(EOD)을 최신순 flat 목록으로. focus 초크포인트가 기록하므로 워크셋·가설·차트·보드 어디서 이동하든 모임.
// 단위 = (날짜,종목) 1행 + 마지막 방문 시각. 행 클릭 = 그 시각으로(time 있으면 goToPoint / 없으면 setFocus) 되돌아가기.
function fmtDate(date: string): string {
    return `${date.slice(5).replace("-", ".")} (${weekdayOf(date)})`;
}

export function RecentHistoryPanel(): JSX.Element {
    const history = useWorkbench((s) => s.history);
    const historyCursor = useWorkbench((s) => s.historyCursor);
    const clearHistory = useWorkbench((s) => s.clearHistory);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const setFocus = useWorkbench((s) => s.setFocus);
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);

    // Alt+W/S 순환 시 커서 행이 항상 보이도록 스크롤. block:"nearest" 라 이미 보이면 안 움직임.
    const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    useEffect(() => {
        const e = historyCursor >= 0 ? history[historyCursor] : undefined;
        if (e) rowRefs.current.get(`${e.date}|${e.code}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [historyCursor, history]);

    // 종목명 해소 — 이 패널의 코드 목록으로 마스터 메타를 직접 배치 조회(다른 패널 데이터셋에 얹지 않음).
    // 주석(선/타점) 없는 종목도 이름이 잡히고, 코드 집합 기준 캐시라 재방문·재정렬엔 재요청 없음.
    const codes = useMemo(() => history.map((e) => e.code), [history]);
    const metaQ = useQuery(stocksMetaQuery(codes));
    const nameByCode = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of metaQ.data ?? []) if (s.name) m.set(s.stockCode, s.name);
        return m;
    }, [metaQ.data]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>최근 탐색</span>
                <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{history.length}</span>
                {history.length > 0 && (
                    <button
                        onClick={() => clearHistory()}
                        title="탐색 기록 비우기"
                        style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", padding: "2px 3px", border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", lineHeight: 0 }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                    </button>
                )}
            </div>

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
                            <Name name={nameByCode.get(e.code) ?? null} code={e.code} strong={selected} />
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
