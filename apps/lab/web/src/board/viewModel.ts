// 테마 보드 계산 — 그날 전 종목 시계열 + 시각 t → 그 시각의 테마 단면.
// tdm-work workbench lib/boardViewModel.ts 의 buildReplayBoardViewModel 에서 옮겼다. 뺀 것:
//   · 복기 필터 — "매물대" 조건이 그날 마감 고가(trailingHighs[0])를 읽어 사후 정보가 섞인다.
//   · 큐레이션 표시(annotated) — tdm 큐레이션 피드에 기대고, trade-lab 라벨과는 다른 계통이다.
//   · 거래대금 구간 카운트(hover 막대) — 쓰는 화면을 가져오지 않았다.
// 남은 계산은 전부 t 까지의 값만 쓴다(snapshotAt = t 이하 마지막 분, 신호 = t−60초).
import type { PriceMode, ReplayStock } from "../market/types.js";
import type { BoardStock } from "./boardTypes.js";
import { evaluateSignal, groupStocks, isMover, rebasePct, selectHotUniverse, snapshotAt, stocksByTheme, themeParents, type Grouped } from "./domain.js";

/** 유니버스 크기 — 거래대금 상위 amountN ∪ 등락률 상위 rateN(workbench 기본값). */
export const DEFAULT_UNIVERSE = { amountN: 80, rateN: 40 } as const;

export interface ThemeBoard {
    /** 유니버스 종목(평면 목록 — 정렬은 화면이). */
    stocks: BoardStock[];
    grouped: Grouped<BoardStock>;
    /** 테마 → 그 테마를 통째로 포함하는 더 큰 테마들. */
    parents: Map<string, string[]>;
}

/**
 * 유니버스 선정·주도주·1분 신호는 통합(UN) % 로 잰다(잣대 고정). market = "krx" 면 화면에 보이는 % 만
 * KRX 기준가로 바꾼다(기준가가 없으면 UN 그대로).
 */
export function buildThemeBoard(
    index: ReadonlyMap<string, ReplayStock>,
    tUnix: number,
    market: PriceMode,
    universe: { amountN: number; rateN: number } = DEFAULT_UNIVERSE,
): ThemeBoard {
    const snaps: { code: string; changeRate: number; amount: number; openPct: number; highPct: number; lowPct: number }[] = [];
    for (const s of index.values()) {
        const snap = snapshotAt(s, tUnix);
        if (snap) snaps.push({ code: snap.code, changeRate: snap.rate, amount: snap.cumAmount, openPct: snap.openPct, highPct: snap.highPct, lowPct: snap.lowPct });
    }
    const hot = selectHotUniverse(snaps, universe.amountN, universe.rateN);

    const stocks: BoardStock[] = [];
    for (const snap of snaps) {
        if (!hot.has(snap.code)) continue;
        const s = index.get(snap.code);
        if (!s) continue;
        const prev = snapshotAt(s, tUnix - 60);
        const un = s.basePrice.un;
        const krx = s.basePrice.krx;
        const view = (p: number): number => (market === "krx" && un !== null && krx !== null ? rebasePct(p, un, krx) : p);
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
            isMover: isMover(s.marketCap ? Number(s.marketCap) / 1e8 : null, snap.changeRate),
            signal: prev ? evaluateSignal(snap.changeRate - prev.rate, snap.amount - prev.cumAmount) : null,
        });
    }
    const byTheme = stocksByTheme(stocks);
    return { stocks, grouped: groupStocks(byTheme, stocks), parents: themeParents(byTheme) };
}

/**
 * 현재 종목이 테마 카드 밖에 있을 때 그 자리 — 테마 카드에 들었으면(또는 종목이 없으면) null.
 *  미분류·개별 = 보드 아래 꼬리 카드에 있다 / 랭킹 밖 = 그 시각 유니버스(거래대금·등락률 상위)에 없다.
 */
export function focusPlace(grouped: Grouped<BoardStock>, code: string): "미분류" | "개별" | "랭킹 밖" | null {
    if (!code || grouped.themes.some((g) => g.stocks.some((s) => s.code === code))) return null;
    if (grouped.unclassified.some((s) => s.code === code)) return "미분류";
    if (grouped.individuals.some((s) => s.code === code)) return "개별";
    return "랭킹 밖";
}
