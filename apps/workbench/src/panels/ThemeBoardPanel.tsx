import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { useDayReduction, useReductionIndex } from "../lib/leanModel.js";
import { dailyMetric } from "../lib/dailyMetrics.js";
import { stocksByTheme, themeParents, groupStocks, isMover, isNearWindowHigh } from "@trade-data-manager/market/domain";
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
    // 거래대금 구간 횟수(EOD) — 축약물의 bucketCounts. 블로킹 안 함(hover 부가정보, 늦게 채워짐).
    const reductionQ = useDayReduction(date);
    const reductionIndex = useReductionIndex(reductionQ.data);

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
                let match = st.filterCombine === "and" ? cHigh && cAmt : cHigh || cAmt;
                // 신고가 근접(추가 AND). trailingHighs 는 축약물 로딩 후에만 판정 — 로딩 중엔 게이트 미적용(깜빡임 방지).
                if (st.filterNewHigh && reductionIndex) {
                    const th = reductionIndex.get(s.stockCode)?.trailingHighs;
                    match = match && (th ? isNearWindowHigh(th, st.filterNewHighWindow, st.filterNewHighTolerance) : false);
                }
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
                buckets: reductionIndex?.get(s.stockCode)?.bucketCounts,
                dim,
            });
        }
        const byTheme = stocksByTheme(stocks);
        return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme) };
    }, [summaryQ.data, st, reductionIndex]);

    if (summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중…`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardLayout grouped={board.grouped} parents={board.parents} focusCode={code} onPick={setCode} showIndividuals={st.showIndividuals} showUnclassified={st.showUnclassified} />
        </div>
    );
}
