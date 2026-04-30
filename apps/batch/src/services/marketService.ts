import { kiwoomClient } from "../clients/kiwoomClient.js";
import { findDailyCandle, findStockRegDayAsApiFormat, saveDailyCandles, saveMinuteCandles, saveStock, saveTheme, saveThemeMapping } from "../db/marketRepository.js";
import { logger } from "../utils/logger.js";
import { assembleDailyCandles, assembleMinuteCandles } from "./assemblers/candleAssembler.js";
import { ServiceOperation } from "./decorators.js";
import { toStockInsert } from "./mappers/marketDataMapper.js";


export class MarketService {
    /**
     * [1] 종목 기본 정보 동기화 → 수정 완료✅
     */
    @ServiceOperation("Market")
    async syncStockInfo(stockCode: string) {
        const infoRes = await kiwoomClient.getStockInfo(stockCode);
        const data = toStockInsert(infoRes.data);
        await saveStock(data);
    }

    /**
     * [2] 일봉 데이터 동기화 (KRX + NXT 병렬 처리)
     */
    @ServiceOperation("Candle-Daily")
    async syncDailyCandles(stockCode: string, apiDate: string = "") {
        const stockCodeNxt = `${stockCode}_AL`;

        const [krxCandles, nxtCandles, regDay] = await Promise.all([
            kiwoomClient.getDailyChartsByCount(stockCode, apiDate, 600),
            kiwoomClient.getDailyChartsByCount(stockCodeNxt, apiDate, 600),
            findStockRegDayAsApiFormat(stockCode),
        ]);

        if (krxCandles.length === 0 || nxtCandles.length === 0) {
            logger.warn(`[MarketService] 일봉 데이터 없음`, {
                stockCode, krx: krxCandles.length, nxt: nxtCandles.length,
            });
            return;
        }

        const rows = assembleDailyCandles({
            stockCode, regDay, krxCandles, nxtCandles,
        });

        if (rows.length > 0) {
            await saveDailyCandles(rows);
        }
    }

    @ServiceOperation("Candle-Minute")
    async syncMinuteCandles(stockCode: string, tradeDate: string) {
        const dailyRow = await findDailyCandle(stockCode, tradeDate);
        if (!dailyRow) {
            logger.warn(`[MarketService] 일봉 데이터가 없어 분봉 수집을 건너뜁니다.`, { stockCode, tradeDate });
            return;
        }

        const apiDate = tradeDate.replace(/-/g, "");
        const stockCodeNxt = `${stockCode}_AL`;
        const kiwoomMinuteCandles = await kiwoomClient.getMinuteChartsForDate(stockCodeNxt, apiDate);

        if (kiwoomMinuteCandles.length === 0) {
            logger.warn(`[MarketService] 분봉 데이터 없음`, { stockCode, tradeDate });
            return;
        }

        const rows = assembleMinuteCandles({
            candles: kiwoomMinuteCandles,
            dailyCandleId: dailyRow.id,
            stockCode,
            tradeDate,
            previousCloseKrx: dailyRow.prevCloseKrx,
            previousCloseNxt: dailyRow.prevCloseNxt,
        });

        if (rows.length === 0) {
            logger.warn(`[MarketService] 해당 날짜의 분봉이 없습니다.`, { stockCode, tradeDate });
            return;
        }

        await saveMinuteCandles(rows);
    }

    /**
     * [4] 테마 매핑 저장
     */
    @ServiceOperation("Theme")
    async syncThemeMapping(stockCode: string, tradeDate: string, themeName: string) {
        const dailyRow = await findDailyCandle(stockCode, tradeDate);
        if (!dailyRow) return;

        const themeId = await saveTheme(themeName);
        await saveThemeMapping(themeId, dailyRow.id);
    }
}

export const marketService = new MarketService();