import { and, eq, inArray } from "drizzle-orm";
import {
    stocks,
    minuteCandles,
} from "../schema/market";
import { minuteCandleFeatures } from "../schema/features";
import type { Database } from "../db";
import {
    findThemesByStockAndDate,
    findMemberCodesByThemeIds,
} from "../repositories/theme.repository";

/* ===========================================================
 * Theme Snapshot — 단건 (종목/거래일/거래시간) 시점 스냅샷
 *
 * deck 카드용. self + 같은 테마 동반 종목들의 그 시점의 분봉 피처 raw row 와
 * 현재 분봉 거래대금만 묶어서 반환합니다.
 *
 * 한 종목이 여러 테마에 속하면 테마별로 element 가 N 개 나옵니다.
 * 테마 매핑이 없으면 self 만 포함된 가짜 테마 (themeId='', themeName='(테마 없음)') 1 개를 반환합니다.
 *
 * StockMetrics DTO 변환(amountDistribution 객체 조립, bigint→string 등)은
 * 호출부(data-view) 책임입니다.
 * =========================================================== */

import type { MinuteFeatureRow } from "./theme-bundle";

export interface ThemeSnapshotMember {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
    feature: MinuteFeatureRow | null;       // 해당 시점 raw 피처 row (없으면 null)
    currentMinuteAmount: bigint | null;     // minute_candles.trading_amount (없으면 null)
}

export interface ThemeSnapshot {
    themeId: string;       // bigint -> string. 테마 매핑 없을 때는 ""
    themeName: string;     // 테마 매핑 없을 때는 "(테마 없음)"
    members: ThemeSnapshotMember[]; // self 항상 포함
}

export async function getThemeSnapshotAt(
    db: Database,
    params: { stockCode: string; tradeDate: string; tradeTime: string }
): Promise<ThemeSnapshot[]> {
    const { stockCode, tradeDate, tradeTime } = params;

    // 1) self 가 그날 속한 테마 목록 (없으면 가짜 테마 1 개)
    const themes = await findThemesByStockAndDate(db, { stockCode, tradeDate });

    // 2) 테마별 멤버 코드 (self 포함)
    const themeIds = themes.map((t) => t.themeId);
    const themeToCodes = await findMemberCodesByThemeIds(db, { themeIds, tradeDate, selfCode: stockCode });

    // 3) 모든 코드 합집합
    const allCodes = collectAllCodes(themeToCodes, stockCode);

    // 4) 시점 단위 일괄 조회: 종목명 + 분봉 피처 + 현재 분봉 거래대금
    const [nameMap, featureMap, amountMap] = await Promise.all([
        fetchStockNames(db, allCodes),
        fetchFeaturesAt(db, allCodes, tradeDate, tradeTime),
        fetchCurrentMinuteAmounts(db, allCodes, tradeDate, tradeTime),
    ]);

    // 5) 결과 조립
    return themes.map(({ themeId, themeName }) => {
        const codes = themeToCodes.get(themeId) ?? [stockCode];
        const ordered = [stockCode, ...codes.filter((c) => c !== stockCode)];
        const members: ThemeSnapshotMember[] = ordered.map((code) => ({
            stockCode: code,
            stockName: nameMap.get(code) ?? code,
            isSelf: code === stockCode,
            feature: featureMap.get(code) ?? null,
            currentMinuteAmount: amountMap.get(code) ?? null,
        }));
        return { themeId, themeName, members };
    });
}

function collectAllCodes(
    themeToCodes: Map<string, string[]>,
    stockCode: string,
): string[] {
    const set = new Set<string>([stockCode]);
    for (const codes of themeToCodes.values()) {
        for (const c of codes) set.add(c);
    }
    return Array.from(set);
}

/* ===========================================================
 * 3) 종목명
 * =========================================================== */

async function fetchStockNames(
    db: Database,
    stockCodes: string[],
): Promise<Map<string, string>> {
    if (stockCodes.length === 0) return new Map();
    const rows = await db
        .select({ stockCode: stocks.stockCode, stockName: stocks.stockName })
        .from(stocks)
        .where(inArray(stocks.stockCode, stockCodes));
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.stockCode, r.stockName);
    return map;
}

/* ===========================================================
 * 4) 시점 분봉 피처 (stockCode 별 단건)
 * =========================================================== */

async function fetchFeaturesAt(
    db: Database,
    stockCodes: string[],
    tradeDate: string,
    tradeTime: string,
): Promise<Map<string, MinuteFeatureRow>> {
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select()
        .from(minuteCandleFeatures)
        .where(
            and(
                inArray(minuteCandleFeatures.stockCode, stockCodes),
                eq(minuteCandleFeatures.tradeDate, tradeDate),
                eq(minuteCandleFeatures.tradeTime, tradeTime),
            ),
        );

    const map = new Map<string, MinuteFeatureRow>();
    for (const r of rows as Array<Record<string, any>>) {
        map.set(r.stockCode as string, r);
    }
    return map;
}


/* ===========================================================
 * 5) 시점 분봉 거래대금 (stockCode -> tradingAmount)
 * =========================================================== */

async function fetchCurrentMinuteAmounts(
    db: Database,
    stockCodes: string[],
    tradeDate: string,
    tradeTime: string,
): Promise<Map<string, bigint>> {
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select({
            stockCode: minuteCandles.stockCode,
            tradingAmount: minuteCandles.tradingAmount,
        })
        .from(minuteCandles)
        .where(
            and(
                inArray(minuteCandles.stockCode, stockCodes),
                eq(minuteCandles.tradeDate, tradeDate),
                eq(minuteCandles.tradeTime, tradeTime),
            ),
        );

    const map = new Map<string, bigint>();
    for (const r of rows) {
        try {
            const v = r.tradingAmount as any;
            if (v === null || v === undefined || v === "") continue;
            if (typeof v === "bigint") map.set(r.stockCode, v);
            else map.set(r.stockCode, BigInt(String(v).split(".")[0]));
        } catch {
            // skip
        }
    }
    return map;
}
