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
 * 3. 특정 날짜와 테마에 속한 종목 및 분봉 차트 데이터 조회 (2-Step Data Fetching)
 */
export async function getAllStockWithMinuteChart(date: string, themeId: bigint | number | string) {
    const startTime = Date.now();
    logger.debug("[db-service] getAllStockWithMinuteChart 요청 시작", { date, themeId: themeId.toString() });
    try {
        // Step 1: 메타데이터 및 일봉 요약 정보 조회
        const dailyCandleList = await db
            .select({
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
            .innerJoin(schema.dailyCandles, eq(schema.dailyThemeMappings.dailyCandleId, schema.dailyCandles.id))
            .innerJoin(schema.stocks, eq(schema.dailyCandles.stockCode, schema.stocks.stockCode))
            .where(
                and(
                    eq(schema.dailyThemeMappings.themeId, BigInt(themeId)),
                    eq(schema.dailyCandles.tradeDate, date)
                )
            );

        if (dailyCandleList.length === 0) {
            logger.info("[db-service] getAllStockWithMinuteChart 완료 (데이터 없음)", { date, themeId: themeId.toString(), durationMs: Date.now() - startTime });
            return [];
        }

        const dailyCandleIds = dailyCandleList.map((info) => info.dailyCandleId);

        // Step 2: 분봉 데이터 대량 조회
        const minutes: schema.MinuteCandle[] = await db
            .select()
            .from(schema.minuteCandles)
            .where(inArray(schema.minuteCandles.dailyCandleId, dailyCandleIds))
            .orderBy(asc(schema.minuteCandles.dailyCandleId), asc(schema.minuteCandles.tradeTime));

        // Step 3: 데이터 조립 (계층형 구조)
        // bigint 타입의 id를 string 키로 변환하여 그룹화
        const minutesByCandleId: Record<string, schema.MinuteCandle[]> = _.groupBy(minutes, (m) => m.dailyCandleId.toString());

        const result = dailyCandleList.map((info) => {
            const candleIdStr = info.dailyCandleId.toString();
            const stockMinutes = minutesByCandleId[candleIdStr] || [];

            return {
                stockCode: info.stockCode,
                stockName: info.stockName,

                dailyInfo: {
                    dailyCandleId: candleIdStr,
                    prevCloseKrx: info.prevCloseKrx ? Number(info.prevCloseKrx) : null,
                    prevCloseNxt: info.prevCloseNxt ? Number(info.prevCloseNxt) : null,
                    marketCap: info.marketCap?.toString() || null, // Next.js BigInt 직렬화 에러 대응
                    // 일봉 요약 거래대금 억 단위 통일 (백만 단위이므로 / 100)
                    tradingAmountKrx: Number((Number(info.tradingAmountKrx) / 100).toFixed(1)),
                    tradingAmountNxt: Number((Number(info.tradingAmountNxt) / 100).toFixed(1)),
                },
                // 직렬화 처리 및 데이터 매핑을 최종 단계에서 수행
                minuteCandles: stockMinutes.map((curr) => ({
                    tradeTime: curr.tradeTime,
                    open: Number(curr.open),
                    high: Number(curr.high),
                    low: Number(curr.low),
                    close: Number(curr.close),
                    openRateKrx: curr.openRateKrx ? Number(curr.openRateKrx) : null,
                    highRateKrx: curr.highRateKrx ? Number(curr.highRateKrx) : null,
                    lowRateKrx: curr.lowRateKrx ? Number(curr.lowRateKrx) : null,
                    closeRateKrx: curr.closeRateKrx ? Number(curr.closeRateKrx) : null,
                    openRateNxt: curr.openRateNxt ? Number(curr.openRateNxt) : null,
                    highRateNxt: curr.highRateNxt ? Number(curr.highRateNxt) : null,
                    lowRateNxt: curr.lowRateNxt ? Number(curr.lowRateNxt) : null,
                    closeRateNxt: curr.closeRateNxt ? Number(curr.closeRateNxt) : null,
                    tradingVolume: curr.tradingVolume?.toString() || "0", // Next.js BigInt 직렬화 에러 대응
                    // 분봉 거래대금 억 단위 변환 (차트 Y축 매핑을 위해 Number 타입 반환)
                    tradingAmount: Number((Number(curr.tradingAmount) / 100000000).toFixed(1)),
                })),
            };
        });

        logger.info("[db-service] getAllStockWithMinuteChart 완료", { 
            date, 
            themeId: themeId.toString(), 
            stockCount: dailyCandleList.length,
            minuteCount: minutes.length,
            durationMs: Date.now() - startTime 
        });

        return result;
    } catch (error: any) {
        logger.error("[db-service] getAllStockWithMinuteChart 중 에러 발생", { date, themeId: themeId.toString(), error: error.message, stack: error.stack });
        throw error;
    }
}

/**
 * 4. 특정 종목의 기준일 포함 과거 일봉 차트 데이터 조회
 */
export async function getStockDailyChartData(stockCode: string, targetDate: string) {
    const startTime = Date.now();
    logger.debug("[db-service] getStockDailyChartData 요청 시작", { stockCode, targetDate });
    try {
        // 반환 타입을 Drizzle 스키마에서 export한 DailyCandle 배열로 명시(또는 자동 추론)
        const candles: schema.DailyCandle[] = await db
            .select()
            .from(schema.dailyCandles)
            .where(
                and(
                    eq(schema.dailyCandles.stockCode, stockCode),
                    lte(schema.dailyCandles.tradeDate, targetDate) // targetDate 포함 과거 데이터만 필터링
                )
            )
            .orderBy(asc(schema.dailyCandles.tradeDate)); // 차트 렌더링을 위해 과거 -> 최신(오름차순) 정렬

        logger.info("[db-service] getStockDailyChartData 완료", { 
            stockCode, 
            targetDate, 
            candleCount: candles.length,
            durationMs: Date.now() - startTime 
        });

        return candles.map((candle) => ({
            tradeDate: candle.tradeDate,

            // 가격 데이터 (차트 Y축 매핑을 위해 Number 변환)
            openKrx: Number(candle.openKrx),
            highKrx: Number(candle.highKrx),
            lowKrx: Number(candle.lowKrx),
            closeKrx: Number(candle.closeKrx),

            openNxt: Number(candle.openNxt),
            highNxt: Number(candle.highNxt),
            lowNxt: Number(candle.lowNxt),
            closeNxt: Number(candle.closeNxt),

            // 거래량 BigInt 에러 방지
            tradingVolumeKrx: candle.tradingVolumeKrx.toString(),
            tradingAmountKrx: Number((Number(candle.tradingAmountKrx) / 100).toFixed(1)),
            tradingVolumeNxt: candle.tradingVolumeNxt.toString(),
            tradingAmountNxt: Number((Number(candle.tradingAmountNxt) / 100).toFixed(1)),

            prevCloseKrx: candle.prevCloseKrx ? Number(candle.prevCloseKrx) : null,
            prevCloseNxt: candle.prevCloseNxt ? Number(candle.prevCloseNxt) : null,
            changeValueKrx: candle.changeValueKrx ? Number(candle.changeValueKrx) : null,
            changeValueNxt: candle.changeValueNxt ? Number(candle.changeValueNxt) : null,

            marketCap: candle.marketCap?.toString() || null,
        }));
    } catch (error: any) {
        logger.error("[db-service] getStockDailyChartData 중 에러 발생", { stockCode, targetDate, error: error.message, stack: error.stack });
        throw error;
    }
}

// ============================================================================
// 프론트엔드(Client Component)에서 별도 선언 없이 바로 가져다 쓸 수 있는 타입 모음
// ============================================================================
export type AvailableDates = Awaited<ReturnType<typeof getAvailableDates>>;
export type ThemeItem = Awaited<ReturnType<typeof getThemesByDate>>[number];
export type MinuteChart = Awaited<ReturnType<typeof getAllStockWithMinuteChart>>[number];
export type DailyCandle = Awaited<ReturnType<typeof getStockDailyChartData>>[number];
