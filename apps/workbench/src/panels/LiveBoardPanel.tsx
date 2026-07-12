import { useId, useMemo, useState } from "react";
import { useLiveSnapshot } from "../api/live.js";
import { useWorkbench } from "../store/workbench.js";
import { StockRow } from "../components/board/StockRow.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";
import { liveToBoardStock, buildLiveBoardViewModel } from "../lib/boardViewModel.js";

// 실시간 보드(광역) — apps/live SSE 를 구독해 조건검색 hot 종목을 표시.
// 두 모드: "리스트"(거래대금순 flat, StockRow) / "테마"(테마 그룹 카드, 복기·테마 보드의 BoardLayout 재사용).
// 행 렌더·테마 우클릭 배정은 StockRow 아톰 재사용(배정은 전역 모달 → apps/api). 흐리게(일봉)는 후속 6c.
const EMPTY_EXCLUDED = new Map<string, string[]>(); // 실시간 보드엔 배제필터 없음(안정 ref).

type LiveMode = "flat" | "group";

export function LiveBoardPanel(): JSX.Element {
    const { snapshot, error } = useLiveSnapshot();
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);
    const focusOrigin = useWorkbench((s) => s.lastFocusOrigin);
    const originId = useId();
    const [mode, setMode] = useState<LiveMode>("flat");

    const flatRows = useMemo(() => {
        if (!snapshot) return [];
        return [...snapshot.stocks].sort((a, b) => b.tradeValue - a.tradeValue).map(liveToBoardStock);
    }, [snapshot]);
    const vm = useMemo(() => (snapshot && mode === "group" ? buildLiveBoardViewModel(snapshot.stocks) : null), [snapshot, mode]);

    if (!snapshot) return <BoardCenter text={error ? "연결 오류 — 재연결 중…" : "연결 중…"} />;

    const live = snapshot.status === "live";
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: live ? "var(--rise)" : "var(--text-tertiary)" }}>{live ? "● 실시간" : `○ ${snapshot.status}`}</span>
                <span>{snapshot.hot}종목</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                    {(["flat", "group"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            style={{
                                fontSize: 10,
                                padding: "1px 7px",
                                borderRadius: 3,
                                border: "1px solid var(--border-subtle)",
                                cursor: "pointer",
                                font: "inherit",
                                background: mode === m ? "var(--bg-active)" : "transparent",
                                color: mode === m ? "var(--text-primary)" : "var(--text-tertiary)",
                            }}
                        >
                            {m === "flat" ? "리스트" : "테마"}
                        </button>
                    ))}
                </div>
            </div>
            {mode === "flat" ? (
                <div style={{ flex: 1, overflowY: "auto" }}>
                    {flatRows.length === 0 ? (
                        <BoardCenter text={live ? "조건 편입 종목 없음" : "엔진 대기중 (LIVE_CONDITION_NAME 미설정?)"} />
                    ) : (
                        flatRows.map((s, i) => (
                            <StockRow key={s.code} s={s} rank={i + 1} selected={s.code === code} onPick={(c) => setCode(c, originId)} />
                        ))
                    )}
                </div>
            ) : (
                <BoardLayout
                    grouped={vm!.grouped}
                    parents={vm!.parents}
                    focusCode={code}
                    onPick={(c) => setCode(c, originId)}
                    selfOrigin={originId}
                    focusOrigin={focusOrigin}
                    excludedByFilter={EMPTY_EXCLUDED}
                    absentLabel="스캔 밖"
                />
            )}
        </div>
    );
}
