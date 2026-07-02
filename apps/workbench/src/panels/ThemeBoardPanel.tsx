import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { dailyMetric } from "../lib/dailyMetrics.js";
import { stocksByTheme, themeParents, groupStocks, isMover } from "@trade-data-manager/market/domain";
import { BoardCenter, type BoardStock } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";

// 이슈정리 보드(EOD) — market-eye식 테마카드에 등락률 랭킹 + 눕힌 일봉 캔들 + 분포 미니맵 + 포함관계.
// 데이터: day-summary 한 방(일봉 candle+테마 멤버십). ≥2 테마=카드, 나머지=개별/미분류 버킷.
// 종목 클릭 → setCode(Focus) → 차트(단일 /chart). (실시간 복기/스크러버는 별도 보드 ②)
export function ThemeBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);

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
            });
        }
        const byTheme = stocksByTheme(stocks);
        return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme) };
    }, [summaryQ.data]);

    if (summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중…`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    const { grouped, parents } = board;
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <BoardLayout grouped={grouped} parents={parents} focusCode={code} onPick={setCode} />
        </div>
    );
}
