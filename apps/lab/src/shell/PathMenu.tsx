// 경로 우클릭 판 — 「다른 경로 가져오기」(그 경로의 날짜·시각·종목을 통째로) + 「기록」(본 종목·날짜, 최신순).
// 기록 줄을 누르면 이 경로를 그 종목·날짜(마지막으로 보던 시각)로 되돌리고, 기록 순서는 바꾸지 않는다(차례로 훑게).
// 어느 쪽이든 고르면 이 경로가 활성이 되고 판이 닫힌다. 기록 줄의 × 는 마우스를 올릴 때만(.history-row, styles.css).
import type { ReactNode } from "react";
import { usePaths } from "../store/paths.js";
import { returnTo, useHistory } from "../store/history.js";
import { useStockNameOf } from "../market/queries.js";
import { dateLabel } from "../lib/date.js";
import { MENU_PAD, MenuItem } from "../ui/popover/menu.js";
import { PathBadge } from "./PathBadge.js";
import { stockLabel, summarizeSituation } from "./pathSummary.js";

export function PathMenu({ pathId, onClose }: { pathId: string; onClose: () => void }): JSX.Element {
    const paths = usePaths((st) => st.paths);
    const visits = useHistory((st) => st.visits);
    const remove = useHistory((st) => st.remove);
    const nameOf = useStockNameOf();
    const self = paths.find((p) => p.id === pathId);
    const others = paths.filter((p) => p.id !== pathId);

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, padding: MENU_PAD }}>
            <Head>다른 경로 가져오기</Head>
            {others.length === 0 ? (
                <Empty>다른 경로가 없다(설정 창 「경로」에서 추가).</Empty>
            ) : (
                others.map((p) => (
                    <MenuItem
                        key={p.id}
                        title={`경로 ${p.id} 의 날짜·시각·종목을 경로 ${pathId} 로`}
                        onClick={() => {
                            usePaths.getState().write(pathId, { ...p.s });
                            onClose();
                        }}
                    >
                        <PathBadge path={p} />
                        <span className="tabular" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{summarizeSituation(p.s, stockLabel(p.s.code, nameOf(p.s.code)))}</span>
                    </MenuItem>
                ))
            )}
            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
            <Head>기록 (종목·날짜)</Head>
            {visits.length === 0 ? (
                <Empty>종목과 날짜가 정해진 경로를 보면 여기에 쌓인다.</Empty>
            ) : (
                <div style={{ overflowY: "auto", minHeight: 0, maxHeight: 280 }}>
                    {visits.map((v) => {
                        const here = !!self && v.code === self.s.code && v.date === self.s.date;
                        return (
                            <div
                                key={`${v.code}@${v.date}`}
                                className="menu-item history-row"
                                role="menuitem"
                                {...(here ? { "data-selected": "" } : {})}
                                title={`경로 ${pathId} 를 이 종목·날짜로`}
                                onClick={() => {
                                    returnTo(pathId, v);
                                    onClose();
                                }}
                                style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px", padding: "3px 8px", borderRadius: 5, fontSize: 11.5, cursor: "pointer" }}
                            >
                                <span className="tabular" style={{ color: "var(--text-2)", flexShrink: 0 }}>{dateLabel(v.date)}</span>
                                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: here ? 700 : 400 }}>{stockLabel(v.code, nameOf(v.code))}</span>
                                <span className="tabular" style={{ color: "var(--text-3)", flexShrink: 0 }}>{v.time}</span>
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
        </div>
    );
}

function Head({ children }: { children: ReactNode }): JSX.Element {
    return <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", padding: "4px 12px 2px" }}>{children}</div>;
}

function Empty({ children }: { children: ReactNode }): JSX.Element {
    return <div style={{ fontSize: 11.5, color: "var(--text-3)", padding: "3px 12px" }}>{children}</div>;
}
