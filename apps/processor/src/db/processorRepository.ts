import { db, minuteCandles, minuteCandleFeatures, dailyCandles, dailyThemeMappings, themeFeatures, themeStockContexts, themes, stocks, tradingOpportunities } from "@trade-data-manager/database";
import type { MinuteCandleFeaturesInsert } from "@trade-data-manager/database";
import { eq, and, asc, sql, getTableColumns, isNull } from "drizzle-orm";

/**
 * [사수의 헬퍼 함수]
 * 테이블의 스키마를 읽어 자동으로 EXCLUDED 업데이트 객체를 생성합니다.
 * @param table Drizzle ORM 테이블 객체
 * @param excludeKeys 업데이트에서 제외할 컬럼명 배열 (예: PK, FK, 생성일)
 */
function buildConflictUpdateSet(table: any, excludeKeys: string[] = []) {
    const allColumns = getTableColumns(table);
    const setParams: Record<string, any> = {};

    for (const [key, column] of Object.entries(allColumns)) {
        // 배열에 포함되지 않은 컬럼만 덮어쓰기 대상으로 지정
        if (!excludeKeys.includes(key)) {
            // column.name은 DB의 실제 스네이크 케이스 컬럼명을 가져옴 (예: 'close_rate_krx')
            setParams[key] = sql.raw(`EXCLUDED.${(column as { name: string }).name}`);
        }
    }

    setParams.updatedAt = sql`NOW()`;
    return setParams;
}

export const processorRepository = {
    /**
     * 1. 특정 종목의 하루 치 분봉 데이터를 시간 오름차순으로 가져옵니다.
     * 시간순 정렬(asc)이 필수입니다. (과거부터 배열을 순회하며 N분전 가격을 찾기 위함)
     */
    async getMinuteCandlesForDay(stockCode: string, tradeDate: string) {
        return await db.query.minuteCandles.findMany({
            where: and(
                eq(minuteCandles.stockCode, stockCode),
                eq(minuteCandles.tradeDate, tradeDate)
            ),
            orderBy: [asc(minuteCandles.tradeTime)],
        });
    },

    /**
     * 2. 가공된 분봉 피처(Features) 380건(하루 치)을 Bulk Insert 합니다.
     * 중복된 minuteCandleId가 있으면 최신 계산 결과로 덮어씌웁니다 (Upsert).
     */
    async saveMinuteFeatures(features: MinuteCandleFeaturesInsert[]) {
        if (features.length === 0) return;

        // 💡 덮어쓰면 안 되는 컬럼 명시 (고유 식별자 및 최초 생성일)
        const keysToExclude = [
            'id',
            'minuteCandleId',
            'dailyCandleId',
            'createdAt'
        ];

        await db
            .insert(minuteCandleFeatures)
            .values(features)
            .onConflictDoUpdate({
                target: minuteCandleFeatures.minuteCandleId,
                set: buildConflictUpdateSet(minuteCandleFeatures, keysToExclude),
            });
    },

    /**
     * 특정 테마에 속한 모든 종목의 분봉 피처를 한꺼번에 가져옵니다.
     */
    async getThemeMinutesFeatures(themeId: bigint, tradeDate: string) {
        return await db
            .select({
                feature: minuteCandleFeatures,
                stockCode: minuteCandleFeatures.stockCode,
            })
            .from(minuteCandleFeatures)
            .innerJoin(
                dailyCandles,
                eq(minuteCandleFeatures.dailyCandleId, dailyCandles.id)
            )
            .innerJoin(
                dailyThemeMappings,
                eq(dailyCandles.id, dailyThemeMappings.dailyCandleId)
            )
            .where(
                and(
                    eq(dailyThemeMappings.themeId, themeId),
                    eq(minuteCandleFeatures.tradeDate, tradeDate)
                )
            )
            .orderBy(asc(minuteCandleFeatures.tradeTime));
    },

    /**
     * 테마 피처를 저장하고 생성된 ID를 반환합니다.
     */
    async saveThemeFeature(data: any) {
        const result = await db
            .insert(themeFeatures)
            .values(data)
            .onConflictDoUpdate({
                target: [themeFeatures.themeId, themeFeatures.tradeDate, themeFeatures.tradeTime],
                set: buildConflictUpdateSet(themeFeatures, ['id', 'themeId', 'tradeDate', 'tradeTime', 'createdAt']),
            })
            .returning({ id: themeFeatures.id });
        return result[0].id;
    },

    /**
     * 테마 내 종목 컨텍스트(순위 등)를 Bulk 저장합니다.
     */
    async saveThemeStockContexts(contexts: any[]) {
        if (contexts.length === 0) return;
        await db
            .insert(themeStockContexts)
            .values(contexts)
            .onConflictDoUpdate({
                target: [themeStockContexts.themeFeatureId, themeStockContexts.stockCode],
                set: buildConflictUpdateSet(themeStockContexts, ['id', 'themeFeatureId', 'stockCode', 'createdAt']),
            });
    },

    /**
     * 특정 시점의 종목 피처 + 테마 피처 + 종목 컨텍스트를 한 번에 조회합니다.
     * 한 종목이 여러 테마에 속할 수 있으므로 배열(Array)로 반환합니다.
     */
    async getOpportunitySourceData(stockCode: string, tradeDate: string, tradeTime: string) {
        return await db
            .select({
                feature: minuteCandleFeatures,       // 종목의 분봉 피처
                theme: themes,                      // 테마 정보
                themeFeature: themeFeatures,        // 테마의 통계 피처
                context: themeStockContexts,        // 테마 내 해당 종목의 순위
                stock: stocks                       // 종목 마스터 정보
            })
            .from(minuteCandleFeatures)
            .innerJoin(stocks, eq(minuteCandleFeatures.stockCode, stocks.stockCode))
            .innerJoin(dailyThemeMappings, eq(minuteCandleFeatures.dailyCandleId, dailyThemeMappings.dailyCandleId))
            .innerJoin(themes, eq(dailyThemeMappings.themeId, themes.themeId))
            .innerJoin(
                themeFeatures,
                and(
                    eq(themes.themeId, themeFeatures.themeId),
                    eq(minuteCandleFeatures.tradeDate, themeFeatures.tradeDate),
                    eq(minuteCandleFeatures.tradeTime, themeFeatures.tradeTime)
                )
            )
            .innerJoin(
                themeStockContexts,
                and(
                    eq(themeFeatures.id, themeStockContexts.themeFeatureId),
                    eq(minuteCandleFeatures.stockCode, themeStockContexts.stockCode)
                )
            )
            .where(
                and(
                    eq(minuteCandleFeatures.stockCode, stockCode),
                    eq(minuteCandleFeatures.tradeDate, tradeDate),
                    eq(minuteCandleFeatures.tradeTime, tradeTime)
                )
            );
    },

    /**
     * 슬롯(S1~S6)을 채우기 위해 해당 테마의 상위 종목들을 가져옵니다.
     */
    async getTopStocksInTheme(themeFeatureId: bigint, limit: number = 6) {
        return await db
            .select({
                context: themeStockContexts,
                feature: minuteCandleFeatures
            })
            .from(themeStockContexts)
            .innerJoin(minuteCandleFeatures, eq(themeStockContexts.minuteFeatureId, minuteCandleFeatures.id))
            .where(eq(themeStockContexts.themeFeatureId, themeFeatureId))
            .orderBy(asc(themeStockContexts.rankByRateNxt)) // NXT 등락률 순위 기준
            .limit(limit);
    },

    /**
     * 최종 기회 데이터 저장
     */
    async saveTradingOpportunity(data: any) {
        await db.insert(tradingOpportunities).values(data).onConflictDoNothing();
    },

    /**
     * [증분 모드] minute_candles에 존재하지만 minute_candle_features에 없는 날짜 목록을 반환합니다.
     * 가공이 전혀 이루어지지 않은 날짜만 대상이 됩니다.
     */
    async getPendingTradeDates(): Promise<{ tradeDate: string }[]> {
        return await db
            .selectDistinct({ tradeDate: minuteCandles.tradeDate })
            .from(minuteCandles)
            .leftJoin(
                minuteCandleFeatures,
                eq(minuteCandles.tradeDate, minuteCandleFeatures.tradeDate)
            )
            .where(isNull(minuteCandleFeatures.id))
            .orderBy(asc(minuteCandles.tradeDate));
    },

    /**
     * [강제 모드] minute_candles에 존재하는 모든 날짜 목록을 반환합니다.
     */
    async getAllTradeDates(): Promise<{ tradeDate: string }[]> {
        return await db
            .selectDistinct({ tradeDate: minuteCandles.tradeDate })
            .from(minuteCandles)
            .orderBy(asc(minuteCandles.tradeDate));
    },

};