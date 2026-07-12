// 보드 뷰모델 빌더 — day-summary/day-replay 데이터 + 화면 설정을 보드가 렌더할 구조로 빚는다(순수).
// domain(groupStocks·isMover…)을 호출하되, 화면 개념(BoardStock·필터 설정)에 묶여서 domain 이 아니라 여기(workbench)에 산다.
// 컴포넌트의 useMemo 에서 꺼내 단위테스트 가능하게 한 것. wire → (여기) → 컴포넌트 렌더.
import {
    stocksByTheme,
    themeParents,
    groupStocks,
    isMover,
    selectHotUniverse,
    evaluateSignal,
    evalBoardFilter,
    countAmountBuckets,
    derivedMinutesOf,
    type Grouped,
    type BoardFilterExpr,
} from "@trade-data-manager/market/domain";
import { dailyMetric } from "./dailyMetrics.js";
import { snapshotAt, lastIndexAtOrBefore } from "./leanModel.js";
import type { DaySummary } from "../api/daySummary.js";
import type { ReplayStock } from "../api/dayReplay.js";
import type { ReplayBoardSettings } from "../store/workbench.js";
import type { BoardStock } from "../components/board/BoardCard.js";
import type { LiveStock } from "@trade-data-manager/wire";

export interface BoardViewModel {
    grouped: Grouped<BoardStock>;
    parents: Map<string, string[]>;
    /** 배제 필터 hide 판정으로 로스터에서 빠진 종목 → 사유. NavRail 포커스 배지("필터 제외")가 "랭킹/보드 밖"과 구분하는 근거. */
    excludedByFilter: Map<string, string[]>;
}

/** day-summary(EOD) → 테마보드 렌더 구조. 배제 필터(domain evalBoardFilter, 그룹별 dim/hide+사유)·isMover·buckets·주석 적용. */
export function buildThemeBoardViewModel(summary: DaySummary, annotatedCodes: Set<string>, boardFilter: BoardFilterExpr): BoardViewModel {
    const stocks: BoardStock[] = [];
    const excludedByFilter = new Map<string, string[]>();
    for (const s of summary.stocks) {
        const m = dailyMetric(s);
        if (!m) continue;
        // 배제 필터 — trailingHighs·bucketCounts 는 daySummary folding 으로 함께 온다(별도 로딩 없음).
        const verdict = evalBoardFilter(boardFilter, { highPct: m.highPct, amount: m.amount, buckets: s.bucketCounts, trailingHighs: s.trailingHighs });
        if (verdict.effect === "hide") {
            excludedByFilter.set(s.stockCode, verdict.reasons);
            continue;
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
            dim: verdict.effect === "dim",
            excludedBy: verdict.reasons.length ? verdict.reasons : undefined,
            annotated: annotatedCodes.has(s.stockCode),
        });
    }
    const byTheme = stocksByTheme(stocks);
    return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme), excludedByFilter };
}

/**
 * day-replay 인덱스 + 시점(tUnix) + 복기 설정 → 복기보드 렌더 구조. top-N 유니버스·1분 델타 신호 적용.
 * buckets — 시점 t 까지 누적 분봉 거래대금 구간 카운트(hover). 서버 EOD 와 같은 정책(countAmountBuckets), 창만 [0..t].
 * replayFilter — 시점 t 스냅샷 지표에 evalBoardFilter 재평가(이슈보드와 같은 술어, 상태만 별개). 시간 밀면 동적 재평가.
 */
export function buildReplayBoardViewModel(
    index: Map<string, ReplayStock>,
    tUnix: number,
    rs: ReplayBoardSettings,
    annotatedCodes: Set<string>,
    replayFilter: BoardFilterExpr,
): BoardViewModel {
    const snaps: { code: string; changeRate: number; amount: number; openPct: number; highPct: number; lowPct: number }[] = [];
    for (const s of index.values()) {
        const snap = snapshotAt(s, tUnix);
        if (snap) snaps.push({ code: snap.code, changeRate: snap.rate, amount: snap.cumAmount, openPct: snap.openPct, highPct: snap.highPct, lowPct: snap.lowPct });
    }
    const hotCodes = selectHotUniverse(snaps, rs.amountN, rs.rateN);

    const stocks: BoardStock[] = [];
    const excludedByFilter = new Map<string, string[]>();
    for (const snap of snaps) {
        if (!hotCodes.has(snap.code)) continue;
        const s = index.get(snap.code);
        if (!s) continue;
        const prev = snapshotAt(s, tUnix - 60);
        const signal = prev ? evaluateSignal(snap.changeRate - prev.rate, snap.amount - prev.cumAmount) : null;
        const marketCapEok = s.marketCap ? Number(s.marketCap) / 1e8 : null;
        // 시점 t 까지 누적 버킷 — hover 히스토그램. 그리고 복기 필터 재평가(t 스냅샷 지표 기준).
        const buckets = countAmountBuckets(derivedMinutesOf(s, lastIndexAtOrBefore(s.times, tUnix)));
        const verdict = evalBoardFilter(replayFilter, { highPct: snap.highPct, amount: snap.amount, buckets, trailingHighs: s.trailingHighs });
        if (verdict.effect === "hide") {
            excludedByFilter.set(snap.code, verdict.reasons);
            continue;
        }
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
            buckets,
            dim: verdict.effect === "dim",
            excludedBy: verdict.reasons.length ? verdict.reasons : undefined,
            annotated: annotatedCodes.has(snap.code),
        });
    }
    const byTheme = stocksByTheme(stocks);
    return { grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme), excludedByFilter };
}

// ── 라이브(실시간) 보드 ─────────────────────────────────────────
/** LiveStock(실시간 스냅샷) → BoardStock. 플랫/그룹 뷰 공용 매핑. isMover 는 core 판정(시총 억원). */
export function liveToBoardStock(s: LiveStock): BoardStock {
    return {
        code: s.code,
        name: s.name,
        market: null,
        themes: s.themes,
        changeRate: s.changeRate,
        openPct: s.openPct,
        highPct: s.highPct,
        lowPct: s.lowPct,
        amount: s.tradeValue * 1_000_000, // 백만원 → 원(StockRow 는 억 포맷)
        isMover: isMover(s.marketCap || null, s.changeRate),
        signal: s.signal ?? null,
    };
}

/** 라이브 스냅샷 종목들 → 테마 그룹 뷰모델(BoardLayout 입력). 배제필터는 실시간 보드에 미적용(빈 Map). */
export function buildLiveBoardViewModel(stocks: LiveStock[]): BoardViewModel {
    const boardStocks = stocks.map(liveToBoardStock);
    const byTheme = stocksByTheme(boardStocks);
    return { grouped: groupStocks(byTheme, boardStocks), parents: themeParents(byTheme), excludedByFilter: new Map() };
}
