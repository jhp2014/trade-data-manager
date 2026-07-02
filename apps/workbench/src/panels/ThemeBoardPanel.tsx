import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { dailyMetric } from "../lib/dailyMetrics.js";
import { stocksByTheme, themeParents, isMover } from "@trade-data-manager/market/domain";
import { ThemeCard, BoardCenter, type BoardStock } from "../components/board/BoardCard.js";

// 이슈정리 보드(EOD) — market-eye식 테마카드에 등락률 랭킹 + 눕힌 일봉 캔들 + 분포 미니맵 + 포함관계.
// 데이터: day-summary 한 방(일봉 candle+테마 멤버십). 분봉 벌크 불필요 — EOD 복기라 일봉으로 충분.
// 종목 클릭 → setCode(Focus) → 차트(단일 /chart) 따라옴. (실시간 복기/스크러버는 별도 보드 ②)
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

    // 일봉 지표 조인 → 테마별 로스터 + 포함관계.
    const board = useMemo(() => {
        if (!summaryQ.data) return null;
        const stocks: BoardStock[] = [];
        for (const s of summaryQ.data.stocks) {
            if (s.themes.length === 0) continue; // 카드는 테마 있는 종목만
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
        const parents = themeParents(byTheme);
        // ≥2 멤버 테마만 카드. 정렬: 주도주 수 → 전체 수 → 이름.
        const cards = [...byTheme.entries()]
            .filter(([, list]) => list.length >= 2)
            .sort((a, b) => {
                const ma = a[1].filter((s) => s.isMover).length;
                const mb = b[1].filter((s) => s.isMover).length;
                return mb - ma || b[1].length - a[1].length || a[0].localeCompare(b[0], "ko");
            });
        return { cards, parents };
    }, [summaryQ.data]);

    if (summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중…`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ height: "100%", overflowY: "auto", background: "var(--bg-secondary)" }}>
            <div style={{ padding: "8px 10px", color: "var(--text-secondary)", fontSize: 12 }}>
                {date} · 테마 {board.cards.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 8px 10px" }}>
                {board.cards.map(([theme, list]) => (
                    <ThemeCard
                        key={theme}
                        theme={theme}
                        stocks={list}
                        parents={board.parents.get(theme) ?? []}
                        focusCode={code}
                        onPick={setCode}
                    />
                ))}
                {board.cards.length === 0 && <BoardCenter text="≥2 멤버 테마 없음" />}
            </div>
        </div>
    );
}
