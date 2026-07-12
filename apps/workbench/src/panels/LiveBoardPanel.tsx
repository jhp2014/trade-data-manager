import { useId, useMemo } from "react";
import type { LiveStock } from "@trade-data-manager/wire";
import { useLiveSnapshot } from "../api/live.js";
import { useWorkbench } from "../store/workbench.js";
import { StockRow } from "../components/board/StockRow.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import type { BoardStock } from "../components/board/boardTypes.js";

// 실시간 보드(광역) — apps/live SSE 를 구독해 조건검색 hot 종목을 거래대금순 flat 리스트로.
// 행 렌더는 복기/테마 보드의 StockRow 아톰 재활용. 테마 그룹핑·흐리게는 후속 브릭(테마 멤버십·일봉).
function toBoardStock(s: LiveStock): BoardStock {
    return {
        code: s.code,
        name: s.name,
        market: null,
        themes: [], // 테마 멤버십은 후속 브릭
        changeRate: s.changeRate,
        openPct: s.openPct,
        highPct: s.highPct,
        lowPct: s.lowPct,
        amount: s.tradeValue * 1_000_000, // 백만원 → 원 (StockRow 는 억으로 포맷)
        isMover: false,
        signal: null,
    };
}

export function LiveBoardPanel(): JSX.Element {
    const { snapshot, error } = useLiveSnapshot();
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);
    const originId = useId();

    const rows = useMemo(() => {
        if (!snapshot) return [];
        return [...snapshot.stocks].sort((a, b) => b.tradeValue - a.tradeValue).map(toBoardStock);
    }, [snapshot]);

    if (!snapshot) return <BoardCenter text={error ? "연결 오류 — 재연결 중…" : "연결 중…"} />;

    const live = snapshot.status === "live";
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 8 }}>
                <span style={{ color: live ? "var(--rise)" : "var(--text-tertiary)" }}>{live ? "● 실시간" : `○ ${snapshot.status}`}</span>
                <span>{snapshot.hot}종목</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
                {rows.length === 0 ? (
                    <BoardCenter text={live ? "조건 편입 종목 없음" : "엔진 대기중 (LIVE_CONDITION_NAME 미설정?)"} />
                ) : (
                    rows.map((s, i) => (
                        <StockRow key={s.code} s={s} rank={i + 1} selected={s.code === code} onPick={(c) => setCode(c, originId)} />
                    ))
                )}
            </div>
        </div>
    );
}
