// 보드 뷰모델 빌더 — day-summary/day-replay 데이터 + 화면 설정을 보드가 렌더할 구조로 빚는다(순수).
// domain(groupStocks·isMover…)을 호출하되, 화면 개념(BoardStock·필터 설정)에 묶여서 domain 이 아니라 여기(workbench)에 산다.
// 컴포넌트의 useMemo 에서 꺼내 단위테스트 가능하게 한 것. wire → (여기) → 컴포넌트 렌더.
import {
    stocksByTheme,
    themeParents,
    groupStocks,
    isMover,
    isNearWindowHigh,
    selectHotUniverse,
    evaluateSignal,
    type Grouped,
} from "@trade-data-manager/market/domain";
import { dailyMetric } from "./dailyMetrics.js";
import { snapshotAt } from "./leanModel.js";
import type { DaySummary } from "../api/daySummary.js";
import type { ReplayStock } from "../api/dayReplay.js";
import type { IssueBoardSettings, ReplayBoardSettings } from "../store/workbench.js";
import type { BoardStock } from "../components/board/BoardCard.js";

export interface BoardViewModel {
    grouped: Grouped<BoardStock>;
    parents: Map<string, string[]>;
}

/** day-summary(EOD) + 이슈보드 설정 → 테마보드 렌더 구조. 필터(hide/dim)·isMover·buckets 적용. */
export function buildThemeBoardViewModel(summary: DaySummary, st: IssueBoardSettings): BoardViewModel {
    const stocks: BoardStock[] = [];
    for (const s of summary.stocks) {
        const m = dailyMetric(s);
        if (!m) continue;
        let dim = false;
        if (st.filterOn) {
            const cHigh = m.highPct >= st.filterHighGte;
            const cAmt = m.amount / 1e8 >= st.filterAmountEok;
            let match = st.filterCombine === "and" ? cHigh && cAmt : cHigh || cAmt;
            // 신고가 근접(추가 AND). trailingHighs 는 daySummary folding 으로 스냅샷에 함께 온다(별도 로딩 없음).
            if (st.filterNewHigh) {
                const th = s.trailingHighs;
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
            buckets: s.bucketCounts,
            dim,
        });
    }
    const byTheme = stocksByTheme(stocks);
    return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme) };
}

/** day-replay 인덱스 + 시점(tUnix) + 복기 설정 → 복기보드 렌더 구조. top-N 유니버스·1분 델타 신호 적용. */
export function buildReplayBoardViewModel(
    index: Map<string, ReplayStock>,
    tUnix: number,
    rs: ReplayBoardSettings,
): BoardViewModel {
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
}
