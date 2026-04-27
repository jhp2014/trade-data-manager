import _ from "lodash";
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
    try {
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
    } catch (error: any) {
        logger.error("[db-service] getAvailableDates 중 에러 발생", { error: error.message, stack: error.stack });
        throw error;
    }
}


/**
 * 2. 특정 날짜의 테마 리스트 조회
 * 해당 날짜에 매핑된 종목이 있는 테마들을 가져옵니다.
 */
export async function getThemesByDate(date: string) {
    const startTime = Date.now();
    logger.debug("[db-service] getThemesByDate 요청 시작", { date });
    try {
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
    } catch (error: any) {
        logger.error("[db-service] getThemesByDate 중 에러 발생", { date, error: error.message, stack: error.stack });
        throw error;
    }
}


/**
 * [최적화] 특정 날짜의 모든 테마 데이터(분봉 + 과거 일봉)를 한 번에 조회
 * @returns Record<string, StockData[]> (Key: themeId)
 */
export async function getAllThemesChartDataByDate(date: string) {
    const startTime = Date.now();
    logger.debug("[db-service] getAllThemesChartDataByDate 요청 시작", { date });
    try {
        // 1. 해당 날짜의 모든 테마-종목 매핑 및 요약 정보 조회
        const dailyStockInfoList = await db
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

        if (dailyStockInfoList.length === 0) return {};

        const uniqueCandleIds = Array.from(new Set(dailyStockInfoList.map(c => c.dailyCandleId)));
        const uniqueStockCodes = Array.from(new Set(dailyStockInfoList.map(c => c.stockCode)));

        // 2. 분봉 데이터 대량 조회
        const minutesChartList = await db
            .select()
            .from(schema.minuteCandles)
            .where(inArray(schema.minuteCandles.dailyCandleId, uniqueCandleIds))
            .orderBy(asc(schema.minuteCandles.dailyCandleId), asc(schema.minuteCandles.tradeTime));

        // 3. 과거 일봉 데이터 대량 조회 (종목별 과거 200일치)
        // SQL 최적화를 위해 모든 종목의 과거 데이터를 한꺼번에 가져옵니다.
        const dailyChartList = await db
            .select()
            .from(schema.dailyCandles)
            .where(
                and(
                    inArray(schema.dailyCandles.stockCode, uniqueStockCodes),
                    lte(schema.dailyCandles.tradeDate, date)
                )
            )
            .orderBy(asc(schema.dailyCandles.stockCode), desc(schema.dailyCandles.tradeDate));

        // 데이터 그룹화 (조립 속도 향상)
        const minutesChartByCandleId: Record<string, schema.MinuteCandle[]> = _.groupBy(minutesChartList, m => m.dailyCandleId.toString());
        const dailyChartByStockCode: Record<string, schema.DailyCandle[]> = _.groupBy(dailyChartList, d => d.stockCode);

        // 각 종목이 당일 포함된 모든 테마 이름들을 Set을 활용해 중복 없이 수집
        const themeNamesByStockCode: Record<string, Set<string>> = {};
        for (const { stockCode, themeName } of dailyStockInfoList) {
            (themeNamesByStockCode[stockCode] ??= new Set()).add(themeName);
        }

        // 결과 조립: flat 배열로 먼저 만든 후 groupBy로 테마별로 묶음
        // → _.groupBy가 타입을 자동 추론하므로 Record<string, any[]> 불필요
        const allItems = dailyStockInfoList.map(info => {
            const stockMinutes = minutesChartByCandleId[info.dailyCandleId.toString()] || [];
            // spread로 복사 후 reverse → 원본 배열 변이 방지 (같은 종목이 여러 테마에 속할 때 안전)
            const stockDaily = [...(dailyChartByStockCode[info.stockCode] || [])].reverse();

            return {
                stockCode: info.stockCode,
                stockName: info.stockName,
                themeId: info.themeId.toString(),
                themeName: info.themeName,
                allThemeNames: Array.from(themeNamesByStockCode[info.stockCode]),
                dailyInfo: {
                    // null guard: Number(null) = 0 방지
                    prevCloseKrx: info.prevCloseKrx != null ? Number(info.prevCloseKrx) : null,
                    prevCloseNxt: info.prevCloseNxt != null ? Number(info.prevCloseNxt) : null,
                    marketCap: info.marketCap != null ? Number(info.marketCap) : null,
                    tradingAmountKrx: Number((Number(info.tradingAmountKrx) / 100).toFixed(1)),
                    tradingAmountNxt: Number((Number(info.tradingAmountNxt) / 100).toFixed(1)),
                },
                minuteCandles: stockMinutes.map(m => ({
                    time: m.tradeTime,
                    open: Number(m.open), high: Number(m.high), low: Number(m.low), close: Number(m.close),
                    openRateKrx: Number(m.openRateKrx), highRateKrx: Number(m.highRateKrx), lowRateKrx: Number(m.lowRateKrx), closeRateKrx: Number(m.closeRateKrx),
                    openRateNxt: Number(m.openRateNxt), highRateNxt: Number(m.highRateNxt), lowRateNxt: Number(m.lowRateNxt), closeRateNxt: Number(m.closeRateNxt),
                    tradingAmount: Number((Number(m.tradingAmount) / 100000000).toFixed(1))
                })),
                dailyCandles: stockDaily.map(d => ({
                    time: d.tradeDate,
                    openKrx: Number(d.openKrx), highKrx: Number(d.highKrx), lowKrx: Number(d.lowKrx), closeKrx: Number(d.closeKrx),
                    openNxt: Number(d.openNxt), highNxt: Number(d.highNxt), lowNxt: Number(d.lowNxt), closeNxt: Number(d.closeNxt),
                    tradingAmountKrx: Number((Number(d.tradingAmountKrx) / 100).toFixed(1)),
                    tradingAmountNxt: Number((Number(d.tradingAmountNxt) / 100).toFixed(1)),
                }))
            };
        });

        const result = _.groupBy(allItems, item => item.themeId);

        logger.info("[db-service] Bulk fetch completed", { duration: Date.now() - startTime });
        return result;
    } catch (error: any) {
        logger.error("[db-service] Error in bulk fetch", { error: error.message });
        throw error;
    }
}

export type AvailableDates = Awaited<ReturnType<typeof getAvailableDates>>;
export type ThemeItem = Awaited<ReturnType<typeof getThemesByDate>>[number];
export type AllThemesChartData = Awaited<ReturnType<typeof getAllThemesChartDataByDate>>;
export type ThemeChartData = AllThemesChartData[string];
export type StockChartItem = ThemeChartData[number];