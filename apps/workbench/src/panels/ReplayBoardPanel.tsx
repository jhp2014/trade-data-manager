import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { useDayBoard, useLeanIndex, leanSnapshotAt } from "../lib/leanModel.js";
import { kstToUnix } from "../lib/derive.js";
import { stocksByTheme, themeParents, groupStocks, selectHotUniverse, isMover, evaluateSignal } from "@trade-data-manager/market/domain";
import { ThemeCard, BoardCenter, type BoardStock } from "../components/board/BoardCard.js";

// 실시간 복기 보드(②) — time 스크럽으로 특정 시각의 장중 스냅샷을 market-eye식으로 재현.
// 서버 lean 지표(종목별 분당 running)를 통째로 들고, 시점 t의 랭킹·top-N·카드·포함관계를 인메모리로.
// 유니버스 = 거래대금 top80 ∪ 등락률 top40(튜너블). 종목 클릭 → setCode → 차트. (자동재생 없음)

const SESSION_START_MIN = 8 * 60; // 08:00 (NXT 프리마켓)
const SESSION_END_MIN = 20 * 60; // 20:00 (시간외)

function minToTime(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}
function timeToMin(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

export function ReplayBoardPanel(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const time = useWorkbench((s) => s.focus.time);
    const setCode = useWorkbench((s) => s.setCode);
    const setTime = useWorkbench((s) => s.setTime);

    const [amountN, setAmountN] = useState(80);
    const [rateN, setRateN] = useState(40);

    const summaryQ = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
        staleTime: Infinity,
    });
    const boardQ = useDayBoard(date);
    const index = useLeanIndex(boardQ.data);

    // 스크럽 커서: focus.time 있으면 그 시각, 없으면 장마감 근사(15:30)로 시작.
    const curMin = time ? timeToMin(time) : 15 * 60 + 30;
    const tUnix = kstToUnix(date, minToTime(curMin));

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
        // 전 종목 시점 스냅샷(도메인 순위용 형태 changeRate/amount 로 정규화).
        const snaps: { code: string; changeRate: number; amount: number; openPct: number; highPct: number; lowPct: number }[] = [];
        for (const s of index.values()) {
            const snap = leanSnapshotAt(s, tUnix);
            if (snap) snaps.push({ code: snap.code, changeRate: snap.rate, amount: snap.cumAmount, openPct: snap.openPct, highPct: snap.highPct, lowPct: snap.lowPct });
        }
        // 시점 유니버스: 거래대금 top ∪ 등락률 top — core/market/domain 순수 규칙.
        const hotCodes = selectHotUniverse(snaps, amountN, rateN);

        const stocks: BoardStock[] = [];
        for (const snap of snaps) {
            if (!hotCodes.has(snap.code)) continue;
            const meta = metaByCode.get(snap.code);
            if (!meta) continue;
            // 1분 델타 신호: t vs t−60초 스냅샷 차분.
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
            });
        }
        const byTheme = stocksByTheme(stocks);
        // ≥2 테마=카드 / 개별·미분류 버킷(시점별 동적 포함관계).
        return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme), hot: hotCodes.size };
    }, [index, metaByCode, tUnix, amountN, rateN]);

    if (boardQ.isLoading || summaryQ.isLoading) return <BoardCenter text={`${date} 로딩중… (당일 lean 지표)`} />;
    if (boardQ.isError) return <BoardCenter text={`보드 오류: ${(boardQ.error as Error).message}`} />;
    if (summaryQ.isError) return <BoardCenter text={`요약 오류: ${(summaryQ.error as Error).message}`} />;
    if (!board) return <BoardCenter text="데이터 없음" />;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)" }}>
            {/* 스크러버 */}
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span className="tabular" style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", width: 56 }}>
                        {minToTime(curMin).slice(0, 5)}
                    </span>
                    <input
                        type="range"
                        min={SESSION_START_MIN}
                        max={SESSION_END_MIN}
                        value={curMin}
                        onChange={(e) => setTime(minToTime(Number(e.target.value)))}
                        style={{ flex: 1, accentColor: "var(--accent-primary)" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>hot {board.hot}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span>{date}</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                        거래대금 top
                        <input type="number" value={amountN} min={0} onChange={(e) => setAmountN(Number(e.target.value))} style={numStyle} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        등락률 top
                        <input type="number" value={rateN} min={0} onChange={(e) => setRateN(Number(e.target.value))} style={numStyle} />
                    </label>
                </div>
            </div>

            {/* 카드 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
                    {board.grouped.themes.map((g) => (
                        <ThemeCard
                            key={g.theme}
                            theme={g.theme}
                            stocks={g.stocks}
                            parents={board.parents.get(g.theme) ?? []}
                            focusCode={code}
                            onPick={setCode}
                        />
                    ))}
                    {board.grouped.individuals.length > 0 && (
                        <ThemeCard theme="개별 종목" stocks={board.grouped.individuals} parents={[]} focusCode={code} onPick={setCode} />
                    )}
                    {board.grouped.unclassified.length > 0 && (
                        <ThemeCard theme="미분류" stocks={board.grouped.unclassified} parents={[]} focusCode={code} onPick={setCode} />
                    )}
                    {board.grouped.themes.length === 0 && board.grouped.individuals.length === 0 && board.grouped.unclassified.length === 0 && (
                        <BoardCenter text="이 시각 표시할 종목 없음" />
                    )}
                </div>
            </div>
        </div>
    );
}

const numStyle: React.CSSProperties = {
    width: 44,
    border: "1px solid var(--border-default)",
    borderRadius: 4,
    padding: "1px 4px",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    font: "inherit",
};
