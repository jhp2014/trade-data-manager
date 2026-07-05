import { useMemo } from "react";
import { useWorkbench } from "../store/workbench.js";
import { useDayReplay, useReplayIndex, snapshotAt } from "../lib/leanModel.js";
import { kstToUnix } from "../lib/derive.js";
import { stocksByTheme, themeParents, groupStocks, selectHotUniverse, isMover, evaluateSignal } from "@trade-data-manager/market/domain";
import { BoardCenter, type BoardStock } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";

// 실시간 복기 보드(②) — 전역 시간(Focus.time) 시점의 장중 스냅샷을 market-eye식으로 재현.
// /day-replay 하나로 self-contained(per-minute + 메타). 시간 스크러버는 전역 툴바, top-N 설정은 전역 모달.
export function ReplayBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const time = useWorkbench((s) => s.focus.time);
    const setCode = useWorkbench((s) => s.setCode);
    const rs = useWorkbench((s) => s.replaySettings);

    const boardQ = useDayReplay(date);
    const index = useReplayIndex(boardQ.data); // Map<code, ReplayStock> — per-minute + 메타

    const tUnix = kstToUnix(date, time ?? "15:30:00"); // 시간 미설정 시 장마감 근사

    // 시점 t 스냅샷 → 랭킹 → top-N(거래대금 ∪ 등락률) → 테마 카드 + 포함관계. 메타는 같은 index 에서.
    const board = useMemo(() => {
        if (!index) return null;
        const snaps: { code: string; changeRate: number; amount: number; openPct: number; highPct: number; lowPct: number }[] = [];
        for (const s of index.values()) {
            const snap = snapshotAt(s, tUnix);
            if (snap) snaps.push({ code: snap.code, changeRate: snap.rate, amount: snap.cumAmount, openPct: snap.openPct, highPct: snap.highPct, lowPct: snap.lowPct });
        }
        const hotCodes = selectHotUniverse(snaps, rs.amountN, rs.rateN);

        const stocks: BoardStock[] = [];
        for (const snap of snaps) {
            if (!hotCodes.has(snap.code)) continue;
            const s = index.get(snap.code);
            if (!s) continue;
            const prev = snapshotAt(s, tUnix - 60);
            const signal = prev ? evaluateSignal(snap.changeRate - prev.rate, snap.amount - prev.cumAmount) : null;
            const marketCapEok = s.marketCap ? Number(s.marketCap) / 1e8 : null;
            stocks.push({
                code: snap.code,
                name: s.name ?? snap.code,
                market: s.market,
                themes: s.themes,
                changeRate: snap.changeRate,
                openPct: snap.openPct,
                highPct: snap.highPct,
                lowPct: snap.lowPct,
                amount: snap.amount,
                isMover: isMover(marketCapEok, snap.changeRate),
                signal,
            });
        }
        const byTheme = stocksByTheme(stocks);
        return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme) };
    }, [index, tUnix, rs]);

    if (boardQ.isLoading) return <BoardCenter text={`${date} 로딩중… (복기 데이터)`} />;
    if (boardQ.isError) return <BoardCenter text={`보드 오류: ${(boardQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardLayout grouped={board.grouped} parents={board.parents} focusCode={code} onPick={setCode} />
        </div>
    );
}
