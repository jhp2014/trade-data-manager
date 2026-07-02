import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { dailyMetric } from "../lib/dailyMetrics.js";
import { stocksByTheme, themeParents, groupStocks, isMover } from "@trade-data-manager/market/domain";
import { BoardCenter, type BoardStock } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";

// 이슈정리 보드(EOD) — day-summary 일봉 한 방. 상단은 NavRail 만(설정은 전역 모달, 시간/날짜는 전역 툴바).
// 설정(개별/미분류 표시·필터)은 store.issueSettings 구독.
export function ThemeBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);
    const st = useWorkbench((s) => s.issueSettings);

    const summaryQ = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
        staleTime: Infinity,
    });

    const board = useMemo(() => {
        if (!summaryQ.data) return null;
        const stocks: BoardStock[] = [];
        for (const s of summaryQ.data.stocks) {
            const m = dailyMetric(s);
            if (!m) continue;
            let dim = false;
            if (st.filterOn) {
                const cHigh = m.highPct >= st.filterHighGte;
                const cAmt = m.amount / 1e8 >= st.filterAmountEok;
                const match = st.filterCombine === "and" ? cHigh && cAmt : cHigh || cAmt;
                if (!match) {
                    if (st.filterMode === "hide") continue;
                    dim = true;
                }
            }
            stocks.push({
                code: s.stockCode,
                name: s.name ?? s.stockCode,
                market: s.market,
                themes: s.themes.map((x) => x.theme),
                changeRate: m.rate,
                openPct: m.openPct,
                highPct: m.highPct,
                lowPct: m.lowPct,
                amount: m.amount,
                isMover: isMover(s.marketCap ? Number(s.marketCap) / 1e8 : null, m.rate),
                dim,
            });
        }
        const byTheme = stocksByTheme(stocks);
        return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme) };
    }, [summaryQ.data, st]);

    if (summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중…`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardLayout grouped={board.grouped} parents={board.parents} focusCode={code} onPick={setCode} showIndividuals={st.showIndividuals} showUnclassified={st.showUnclassified} />
        </div>
    );
}
