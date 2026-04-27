import { db } from "@trade-data-manager/database";
import * as schema from "@trade-data-manager/database";
import { eq, desc, and, inArray, asc, lte } from "drizzle-orm";
import { logger } from "./logger";

/**
 * 1. 가용 날짜 리스트 조회
 * DB에 데이터가 존재하는 고유한 날짜들을 내림차순으로 가져옵니다.
 */
export async function getAvailableDates() {
    const startTime = Date.now();
    logger.debug("[db-service] getAvailableDates 요청 시작");
    const result = await db
        .selectDistinct({ tradeDate: schema.dailyCandles.tradeDate })
        .from(schema.dailyCandles)
        .innerJoin(schema.dailyThemeMappings, eq(schema.dailyCandles.id, schema.dailyThemeMappings.dailyCandleId))
        .orderBy(desc(schema.dailyCandles.tradeDate));

    logger.info("[db-service] getAvailableDates 완료", {
        count: result.length,
        durationMs: Date.now() - startTime
    });
    return result.map(r => r.tradeDate);
}


/**
 * 2. 특정 날짜의 테마 리스트 조회
 * 해당 날짜에 매핑된 종목이 있는 테마들을 가져옵니다.
 */
export async function getThemesByDate(date: string) {
    const startTime = Date.now();
    logger.debug("[db-service] getThemesByDate 요청 시작", { date });

    const themes = await db
        .selectDistinct({
            themeId: schema.themes.themeId,
            themeName: schema.themes.themeName,
        })
        .from(schema.themes)
        .innerJoin(schema.dailyThemeMappings, eq(schema.themes.themeId, schema.dailyThemeMappings.themeId))
        .innerJoin(schema.dailyCandles, eq(schema.dailyThemeMappings.dailyCandleId, schema.dailyCandles.id))
        .where(eq(schema.dailyCandles.tradeDate, date));

    logger.info("[db-service] getThemesByDate 완료", {
        date,
        themeCount: themes.length,
        durationMs: Date.now() - startTime
    });

    return themes.map((t) => ({
        themeId: t.themeId.toString(), // Next.js BigInt 직렬화 에러 방지
        themeName: t.themeName,
    }));
}

/**
 * [Repository] 1. 특정 날짜의 테마-종목 매핑 및 일봉 요약 정보 조회
 */
export async function getDailyStockInfoListByDate(date: string) {
    return await db
        .select({
            themeId: schema.dailyThemeMappings.themeId,
            themeName: schema.themes.themeName,
            dailyCandleId: schema.dailyCandles.id,
            stockCode: schema.stocks.stockCode,
            stockName: schema.stocks.stockName,
            prevCloseKrx: schema.dailyCandles.prevCloseKrx,
            prevCloseNxt: schema.dailyCandles.prevCloseNxt,
            marketCap: schema.dailyCandles.marketCap,
            tradingAmountKrx: schema.dailyCandles.tradingAmountKrx,
            tradingAmountNxt: schema.dailyCandles.tradingAmountNxt,
        })
        .from(schema.dailyThemeMappings)
        .innerJoin(schema.themes, eq(schema.dailyThemeMappings.themeId, schema.themes.themeId))
        .innerJoin(schema.dailyCandles, eq(schema.dailyThemeMappings.dailyCandleId, schema.dailyCandles.id))
        .innerJoin(schema.stocks, eq(schema.dailyCandles.stockCode, schema.stocks.stockCode))
        .where(eq(schema.dailyCandles.tradeDate, date));
}

/**
 * [Repository] 2. 특정 DailyCandle ID들의 모든 분봉 조회
 */
export async function getMinutesByCandleIds(dailyCandleIds: bigint[]) {
    if (dailyCandleIds.length === 0) return [];

    return await db
        .select()
        .from(schema.minuteCandles)
        .where(inArray(schema.minuteCandles.dailyCandleId, dailyCandleIds))
        .orderBy(asc(schema.minuteCandles.dailyCandleId), asc(schema.minuteCandles.tradeTime));
}

/**
 * [Repository] 3. 특정 종목들의 과거 일봉 조회
 */
export async function getHistoricalDailyByCodes(stockCodes: string[], date: string) {
    if (stockCodes.length === 0) return [];
    return await db
        .select()
        .from(schema.dailyCandles)
        .where(
            and(
                inArray(schema.dailyCandles.stockCode, stockCodes),
                lte(schema.dailyCandles.tradeDate, date)
            )
        )
        .orderBy(asc(schema.dailyCandles.stockCode), desc(schema.dailyCandles.tradeDate));
}


export type AvailableDates = Awaited<ReturnType<typeof getAvailableDates>>;
export type ThemeItem = Awaited<ReturnType<typeof getThemesByDate>>[number];
