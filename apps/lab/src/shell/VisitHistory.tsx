// 기록 판의 「탐색 기록」 화면 — 어느 경로에서든 본 (종목, 날짜)를 최신순으로(store/history). 옛 경로 우클릭 판의 「기록」을 옮겨 왔다.
// 열기(누름 · Space) = **활성 경로**를 그 종목·날짜(마지막으로 본 시각)로 — 판은 열린 채, 기록 순서도 그대로(차례로 훑게).
// w/s 고르기 · Space 열기는 토큰 기록과 같은 판 안 키(useListKeys). 줄의 × 는 마우스를 올릴 때만(.history-row, styles.css).
import { useEffect, useRef, useState } from "react";
import { usePaths } from "../store/paths.js";
import { returnTo, useHistory, type Visit } from "../store/history.js";
import { useStockNameOf } from "../market/queries.js";
import { dateLabel } from "../lib/date.js";
import { stockLabel } from "./pathSummary.js";
import { MUTED, Note, useListKeys } from "./historyList.js";

const keyOf = (v: Pick<Visit, "code" | "date">): string => `${v.code}@${v.date}`;

export function VisitHistoryMenu(): JSX.Element {
    const visits = useHistory((st) => st.visits);
    const remove = useHistory((st) => st.remove);
    const nameOf = useStockNameOf();
    const activeId = usePaths((st) => st.active);
    const activeS = usePaths((st) => st.paths.find((p) => p.id === st.active)?.s);
    // 고른 줄은 자리가 아니라 (종목@날짜)로 쥔다 — 위 줄을 지워도 고른 줄이 그대로다. 처음엔 활성 경로가 지금 보는 줄, 없으면 맨 위.
    const [picked, setPicked] = useState<string | null>(() => {
        const s = usePaths.getState().paths.find((p) => p.id === usePaths.getState().active)?.s;
        return s && s.code && s.date ? keyOf(s) : null;
    });
    const cur = Math.max(0, visits.findIndex((v) => keyOf(v) === picked));
    const rows = useRef<(HTMLDivElement | null)[]>([]);
    useEffect(() => {
        rows.current[cur]?.scrollIntoView({ block: "nearest" });
    }, [cur]);
    const open = (v: Visit): void => returnTo(activeId, v);
    useListKeys(
        visits.length,
        cur,
        (i) => setPicked(keyOf(visits[i])),
        (i) => open(visits[i]),
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {visits.length === 0 ? (
                <Note style={{ padding: "3px 12px 6px" }}>종목과 날짜가 정해진 경로를 보면 여기에 쌓인다.</Note>
            ) : (
                <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 420 }}>
                    {visits.map((v, i) => {
                        const here = !!activeS && v.code === activeS.code && v.date === activeS.date;
                        return (
                            <div
                                key={keyOf(v)}
                                ref={(el) => void (rows.current[i] = el)}
                                className="menu-item history-row"
                                role="menuitem"
                                data-visit={keyOf(v)}
                                {...(i === cur ? { "data-selected": "" } : {})}
                                title={`누르면(Space) 활성 경로 ${activeId} 를 이 종목·날짜로`}
                                onClick={() => {
                                    setPicked(keyOf(v));
                                    open(v);
                                }}
                                style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px", padding: "3px 8px", borderRadius: 5, fontSize: 11.5, cursor: "pointer" }}
                            >
                                <span aria-hidden style={{ width: 8, flexShrink: 0, fontSize: 8, color: "var(--accent-primary)" }}>{here ? "●" : ""}</span>
                                <span className="tabular" style={{ color: "var(--text-2)", flexShrink: 0 }}>{dateLabel(v.date)}</span>
                                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: here ? 700 : 400 }}>{stockLabel(v.code, nameOf(v.code))}</span>
                                <span className="tabular" style={{ ...MUTED, flexShrink: 0 }}>{v.time}</span>
                                <button
                                    className="history-x"
                                    title="이 기록 지우기"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        remove(v.code, v.date);
                                    }}
                                    style={{ border: "none", background: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid var(--border)", marginTop: 4, padding: "4px 8px 2px 12px", minHeight: 24 }}>
                <Note style={{ flex: 1, fontSize: 10.5 }}>본 종목·날짜 · 최신순 — w/s 고르기 · Space 활성 경로로 열기</Note>
            </div>
        </div>
    );
}
