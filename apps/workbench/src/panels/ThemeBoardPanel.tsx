import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { dailyMetric } from "../lib/dailyMetrics.js";
import { stocksByTheme, themeParents, groupStocks, isMover } from "@trade-data-manager/market/domain";
import { BoardCenter, type BoardStock } from "../components/board/BoardCard.js";
import { BoardLayout } from "../components/board/BoardLayout.js";
import { Modal, GearButton } from "../components/Modal.js";

// 이슈정리 보드(EOD) — market-eye식 테마카드에 등락률 랭킹 + 눕힌 일봉 캔들 + 분포 미니맵 + 포함관계.
// 데이터: day-summary 한 방(일봉 candle+테마 멤버십). ≥2 테마=카드, 나머지=개별/미분류 버킷.
// 종목 클릭 → setCode(Focus) → 차트(단일 /chart). (실시간 복기/스크러버는 별도 보드 ②)
export function ThemeBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const setCode = useWorkbench((s) => s.setCode);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showIndiv, setShowIndiv] = useState(true);
    const [showUnclass, setShowUnclass] = useState(false); // 미분류 기본 숨김(노이즈)
    // 필터: 고가 등락률 ≥ / 거래대금 ≥, AND|OR 결합, 안 맞는 종목은 흐림 or 숨김.
    const [filterOn, setFilterOn] = useState(false);
    const [highGte, setHighGte] = useState(10); // 고가 등락률 %
    const [amountEok, setAmountEok] = useState(100); // 거래대금 억
    const [combine, setCombine] = useState<"and" | "or">("and");
    const [filterMode, setFilterMode] = useState<"dim" | "hide">("dim");

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
            // 필터: 고가등락률 ≥ / 거래대금(억) ≥ 를 AND|OR 로 결합. 안 맞으면 흐림 or 제외.
            let dim = false;
            if (filterOn) {
                const cHigh = m.highPct >= highGte;
                const cAmt = m.amount / 1e8 >= amountEok;
                const match = combine === "and" ? cHigh && cAmt : cHigh || cAmt;
                if (!match) {
                    if (filterMode === "hide") continue;
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
    }, [summaryQ.data, filterOn, highGte, amountEok, combine, filterMode]);

    if (summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중…`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    const { grouped, parents } = board;
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "3px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)", flexShrink: 0 }}>
                <GearButton onClick={() => setSettingsOpen(true)} />
            </div>
            <BoardLayout grouped={grouped} parents={parents} focusCode={code} onPick={setCode} showIndividuals={showIndiv} showUnclassified={showUnclass} />
            {settingsOpen && (
                <Modal title="이슈정리 설정" onClose={() => setSettingsOpen(false)}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="checkbox" checked={showIndiv} onChange={(e) => setShowIndiv(e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
                            개별 종목 카드 표시 ({grouped.individuals.length})
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="checkbox" checked={showUnclass} onChange={(e) => setShowUnclass(e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
                            미분류 카드 표시 ({grouped.unclassified.length})
                        </label>

                        <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                            <input type="checkbox" checked={filterOn} onChange={(e) => setFilterOn(e.target.checked)} style={{ accentColor: "var(--accent-primary)" }} />
                            종목 필터
                        </label>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: filterOn ? 1 : 0.5, pointerEvents: filterOn ? "auto" : "none", paddingLeft: 22 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                고가 등락률 ≥
                                <input type="number" value={highGte} onChange={(e) => setHighGte(Number(e.target.value))} style={numInput} /> %
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                거래대금 ≥
                                <input type="number" value={amountEok} onChange={(e) => setAmountEok(Number(e.target.value))} style={numInput} /> 억
                            </label>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <span>결합</span>
                                {(["and", "or"] as const).map((c) => (
                                    <label key={c} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <input type="radio" name="combine" checked={combine === c} onChange={() => setCombine(c)} style={{ accentColor: "var(--accent-primary)" }} />
                                        {c.toUpperCase()}
                                    </label>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <span>불일치 종목</span>
                                {(["dim", "hide"] as const).map((m) => (
                                    <label key={m} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <input type="radio" name="filterMode" checked={filterMode === m} onChange={() => setFilterMode(m)} style={{ accentColor: "var(--accent-primary)" }} />
                                        {m === "dim" ? "흐리게" : "숨김"}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

const numInput: React.CSSProperties = {
    width: 56,
    border: "1px solid var(--border-default)",
    borderRadius: 4,
    padding: "1px 4px",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    font: "inherit",
};
