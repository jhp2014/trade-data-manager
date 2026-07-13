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
    rebasePct,
    type Grouped,
    type BoardFilterExpr,
} from "@trade-data-manager/market/domain";
import { dailyMetric } from "./dailyMetrics.js";
import { snapshotAt, lastIndexAtOrBefore } from "./leanModel.js";
import type { DaySummary } from "../api/daySummary.js";
import type { ReplayStock } from "../api/dayReplay.js";
import type { ReplayBoardSettings, BoardMarket } from "../store/workbench.js";
import type { BoardStock } from "../components/board/BoardCard.js";
import type { LiveStock } from "@trade-data-manager/wire";

export interface BoardViewModel {
    stocks: BoardStock[]; // flat 리스트(그룹 전, 배제필터 hide 제외). flat 모드 렌더용.
    grouped: Grouped<BoardStock>;
    parents: Map<string, string[]>;
    /** 배제 필터 hide 판정으로 로스터에서 빠진 종목 → 사유. NavRail 포커스 배지("필터 제외")가 "랭킹/보드 밖"과 구분하는 근거. */
    excludedByFilter: Map<string, string[]>;
}

/** day-summary(EOD) → 테마보드 렌더 구조. 배제 필터(domain evalBoardFilter, 그룹별 dim/hide+사유)·isMover·buckets·주석 적용.
 *  market = 보드 기준 시장(% 표시·weakHigh 술어 기준. newHighFar 는 자체 market 파라미터로 시장을 고름). */
export function buildThemeBoardViewModel(summary: DaySummary, annotatedCodes: Set<string>, boardFilter: BoardFilterExpr, market: BoardMarket): BoardViewModel {
    const stocks: BoardStock[] = [];
    const excludedByFilter = new Map<string, string[]>();
    for (const s of summary.stocks) {
        const m = dailyMetric(s, market);
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
    return { stocks, grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme), excludedByFilter };
}

/**
 * day-replay 인덱스 + 시점(tUnix) + 복기 설정 → 복기보드 렌더 구조. top-N 유니버스·1분 델타 신호 적용.
 * buckets — 시점 t 까지 누적 분봉 거래대금 구간 카운트(hover). 서버 EOD 와 같은 정책(countAmountBuckets), 창만 [0..t].
 * replayFilter — 시점 t 스냅샷 지표에 evalBoardFilter 재평가(이슈보드와 같은 술어, 상태만 별개). 시간 밀면 동적 재평가.
 * market — 기준 시장 토글. 서버 % 시계열은 UN base 한 벌 → KRX 는 rawPrevClose 두 스칼라로 일차변환(rebasePct).
 *   유니버스 선정·1분 델타 신호는 UN 고정(잣대 고정 — 서버 EOD·라이브와 패리티), 표시 %·필터 지표만 재기저.
 */
export function buildReplayBoardViewModel(
    index: Map<string, ReplayStock>,
    tUnix: number,
    rs: ReplayBoardSettings,
    annotatedCodes: Set<string>,
    replayFilter: BoardFilterExpr,
    market: BoardMarket,
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
        const signal = prev ? evaluateSignal(snap.changeRate - prev.rate, snap.amount - prev.cumAmount) : null; // UN 잣대 고정
        const marketCapEok = s.marketCap ? Number(s.marketCap) / 1e8 : null;
        // KRX 모드: UN base % → KRX base % 일차변환. base 결손(상장일 등)이면 UN 그대로(폴백).
        const un = s.rawPrevClose.un;
        const krx = s.rawPrevClose.krx;
        const view = (p: number): number => (market === "krx" && un !== null && krx !== null ? rebasePct(p, un, krx) : p);
        // 시점 t 까지 누적 버킷 — hover 히스토그램. 그리고 복기 필터 재평가(t 스냅샷 지표 기준).
        const buckets = countAmountBuckets(derivedMinutesOf(s, lastIndexAtOrBefore(s.times, tUnix)));
        const verdict = evalBoardFilter(replayFilter, { highPct: view(snap.highPct), amount: snap.amount, buckets, trailingHighs: s.trailingHighs });
        if (verdict.effect === "hide") {
            excludedByFilter.set(snap.code, verdict.reasons);
            continue;
        }
        stocks.push({
            code: snap.code,
            name: s.name ?? snap.code,
            market: s.market,
            themes: s.themes,
            changeRate: view(snap.changeRate),
            openPct: view(snap.openPct),
            highPct: view(snap.highPct),
            lowPct: view(snap.lowPct),
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
    return { stocks, grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme), excludedByFilter };
}

// ── 라이브(실시간) 보드 ─────────────────────────────────────────
// 서버는 원주가 값(price/open/high/low)+rawPrevClose{krx,un} 를 내려주고 % 는 여기서 계산(복기와 같은 잣대).
// rawPrevClose 미도착(핫 편입 직후 몇 초)이면 ka10095 base(전일 기준가) 폴백.
function liveBaseOf(s: LiveStock, market: BoardMarket): number | null {
    return s.rawPrevClose?.[market] ?? (s.base > 0 ? s.base : null);
}
function livePct(v: number, base: number | null): number {
    return base !== null && base > 0 ? Math.round(((v - base) / base) * 10_000) / 100 : 0;
}

/** LiveStock(실시간 스냅샷) → BoardStock(market 기준 %). 플랫/그룹 뷰 공용 매핑. isMover 는 core 판정(시총 억원). */
export function liveToBoardStock(s: LiveStock, market: BoardMarket): BoardStock {
    const base = liveBaseOf(s, market);
    const changeRate = livePct(s.price, base);
    return {
        code: s.code,
        name: s.name,
        market: null,
        themes: s.themes,
        changeRate,
        openPct: livePct(s.open, base),
        highPct: livePct(s.high, base),
        lowPct: livePct(s.low, base),
        amount: s.tradeValue * 1_000_000, // 백만원 → 원(StockRow 는 억 포맷)
        isMover: isMover(s.marketCap || null, changeRate),
        signal: s.signal ?? null,
    };
}

/**
 * 라이브 종목 → BoardStock[] + 배제필터(dim/hide) 적용. 흐리게(6c)는 사용자가 실시간 필터에서 조건 지정.
 * trailingHighs(수정주가 KRX/UN 두벌, 과거 완결일)는 시장별로 index 0 에 당일 고가%(그 시장 base)를 prepend
 * — "매물대 내부" 술어의 market 파라미터가 시장을 고른다(KRX+UN AND = 둘 다 내부여야 흐리게).
 * 미fetch(trailingHighs 없음)면 [당일 고가%] 만 → 창최고=당일 → 근접=참 → 안 흐려짐(데이터 오면 반영).
 */
export function applyLiveFilter(stocks: LiveStock[], filter: BoardFilterExpr, market: BoardMarket): { boardStocks: BoardStock[]; excludedByFilter: Map<string, string[]> } {
    const boardStocks: BoardStock[] = [];
    const excludedByFilter = new Map<string, string[]>();
    for (const s of stocks) {
        const highK = livePct(s.high, liveBaseOf(s, "krx"));
        const highU = livePct(s.high, liveBaseOf(s, "un"));
        const verdict = evalBoardFilter(filter, {
            highPct: market === "krx" ? highK : highU,
            amount: s.tradeValue * 1_000_000, // 백만원 → 원
            trailingHighs: { krx: [highK, ...(s.trailingHighs?.krx ?? [])], un: [highU, ...(s.trailingHighs?.un ?? [])] },
        });
        if (verdict.effect === "hide") {
            excludedByFilter.set(s.code, verdict.reasons);
            continue;
        }
        boardStocks.push({ ...liveToBoardStock(s, market), dim: verdict.effect === "dim", excludedBy: verdict.reasons.length ? verdict.reasons : undefined });
    }
    return { boardStocks, excludedByFilter };
}

/** 라이브 스냅샷 → 테마 그룹 뷰모델(BoardLayout 입력). 배제필터 적용. */
export function buildLiveBoardViewModel(stocks: LiveStock[], filter: BoardFilterExpr, market: BoardMarket): BoardViewModel {
    const { boardStocks, excludedByFilter } = applyLiveFilter(stocks, filter, market);
    const byTheme = stocksByTheme(boardStocks);
    return { stocks: boardStocks, grouped: groupStocks(byTheme, boardStocks), parents: themeParents(byTheme), excludedByFilter };
}
