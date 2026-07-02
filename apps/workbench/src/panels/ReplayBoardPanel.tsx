import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { useDayBoard, useLeanIndex, leanSnapshotAt } from "../lib/leanModel.js";
import { kstToUnix } from "../lib/derive.js";
import { stocksByTheme, themeParents, groupStocks, selectHotUniverse, isMover, evaluateSignal } from "@trade-data-manager/market/domain";
import { BoardCenter, type BoardStock } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";

// 실시간 복기 보드(②) — 전역 시간(Focus.time) 시점의 장중 스냅샷을 market-eye식으로 재현.
// 상단은 NavRail 만(시간 스크러버는 전역 툴바, top-N 설정은 전역 모달=store.replaySettings).
export function ReplayBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const time = useWorkbench((s) => s.focus.time);
    const setCode = useWorkbench((s) => s.setCode);
    const { amountN, rateN } = useWorkbench((s) => s.replaySettings);

    const summaryQ = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
        staleTime: Infinity,
    });
    const boardQ = useDayBoard(date);
    const index = useLeanIndex(boardQ.data);

    const tUnix = kstToUnix(date, time ?? "15:30:00"); // 시간 미설정 시 장마감 근사

    // 종목 메타(이름·시장·테마·시총) — day-summary 조인.
    const metaByCode = useMemo(() => {
        const m = new Map<string, { name: string; market: string | null; themes: string[]; marketCap: string | null }>();
        for (const s of summaryQ.data?.stocks ?? [])
            m.set(s.stockCode, { name: s.name ?? s.stockCode, market: s.market, themes: s.themes.map((x) => x.theme), marketCap: s.marketCap });
        return m;
    }, [summaryQ.data]);

    // 시점 t 스냅샷 → 랭킹 → top-N(거래대금 ∪ 등락률) → 테마 카드 + 포함관계.
    const board = useMemo(() => {
        if (!index) return null;
        const snaps: { code: string; changeRate: number; amount: number; openPct: number; highPct: number; lowPct: number; bigCount: number }[] = [];
        for (const s of index.values()) {
            const snap = leanSnapshotAt(s, tUnix);
            if (snap) snaps.push({ code: snap.code, changeRate: snap.rate, amount: snap.cumAmount, openPct: snap.openPct, highPct: snap.highPct, lowPct: snap.lowPct, bigCount: snap.bigCount });
        }
        const hotCodes = selectHotUniverse(snaps, amountN, rateN);

        const stocks: BoardStock[] = [];
        for (const snap of snaps) {
            if (!hotCodes.has(snap.code)) continue;
            const meta = metaByCode.get(snap.code);
            if (!meta) continue;
            const prev = leanSnapshotAt(index.get(snap.code)!, tUnix - 60);
            const signal = prev ? evaluateSignal(snap.changeRate - prev.rate, snap.amount - prev.cumAmount) : null;
            const marketCapEok = meta.marketCap ? Number(meta.marketCap) / 1e8 : null;
            stocks.push({
                code: snap.code,
                name: meta.name,
                market: meta.market,
                themes: meta.themes,
                changeRate: snap.changeRate,
                openPct: snap.openPct,
                highPct: snap.highPct,
                lowPct: snap.lowPct,
                amount: snap.amount,
                isMover: isMover(marketCapEok, snap.changeRate),
                signal,
                bigCount: snap.bigCount,
            });
        }
        const byTheme = stocksByTheme(stocks);
        return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme) };
    }, [index, metaByCode, tUnix, amountN, rateN]);

    if (boardQ.isLoading || summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중… (당일 lean 지표)`} />;
    if (boardQ.isError) return <BoardCenter text={`보드 오류: ${(boardQ.error as Error).message}`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardLayout grouped={board.grouped} parents={board.parents} focusCode={code} onPick={setCode} />
        </div>
    );
}
