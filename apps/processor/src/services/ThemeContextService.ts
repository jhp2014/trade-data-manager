import _ from "lodash";
import { db } from "@trade-data-manager/database";
import { processorRepository } from "../db/processorRepository.js";
import { logger } from "../utils/logger.js";
import { STAT_RATES, STAT_AMOUNTS } from "@trade-data-manager/database";

export class ThemeContextService {

    async processTheme(themeId: bigint, tradeDate: string) {
        // 1. 테마 소속 종목들의 피처 로드
        const rawData = await processorRepository.getThemeMinutesFeatures(themeId, tradeDate);
        if (rawData.length === 0) return;

        // 2. 시간(tradeTime)별로 데이터 그룹화 { "09:00:00": [...], "09:01:00": [...] }
        const groupedByTime = _.groupBy(rawData, (d) => d.feature.tradeTime);

        for (const [time, minuteData] of Object.entries(groupedByTime)) {

            const features = minuteData.map(d => d.feature);

            // 3. theme_features + theme_stock_contexts를 하나의 트랜잭션으로 원자 처리
            //    saveThemeFeature 성공 후 saveThemeStockContexts 실패 시 고아 레코드 방지
            await db.transaction(async (tx) => {
                const themeFeatureId = await processorRepository.saveThemeFeature(tx, {
                    themeId,
                    tradeDate,
                    tradeTime: time,
                    avgRate: _.meanBy(features, f => Number(f.closeRateNxt)).toFixed(4),
                    cntTotalStock: features.length,
                    ...this.calculateRateStats(features),
                    ...this.calculateAmountStats(features)
                });

                // 4. 순위 매기기 (Context 준비)
                const sortedByRateKrx = _.orderBy(features, [f => Number(f.closeRateKrx)], ['desc']);
                const sortedByRateNxt = _.orderBy(features, [f => Number(f.closeRateNxt)], ['desc']);
                const sortedByAmt = _.orderBy(features, [f => Number(f.cumulativeTradingAmount)], ['desc']);

                const contexts = features.map(f => ({
                    themeFeatureId,
                    minuteFeatureId: f.id,
                    themeId,
                    stockCode: f.stockCode,
                    tradeDate: f.tradeDate,
                    tradeTime: f.tradeTime,
                    closeRateKrx: f.closeRateKrx,
                    closeRateNxt: f.closeRateNxt,
                    // 순위 부여 (1부터 시작)
                    rankByRateKrx: _.findIndex(sortedByRateKrx, { id: f.id }) + 1,
                    rankByRateNxt: _.findIndex(sortedByRateNxt, { id: f.id }) + 1,
                    rankByCumulativeTradingAmount: _.findIndex(sortedByAmt, { id: f.id }) + 1,
                }));

                // 5. Context 저장
                await processorRepository.saveThemeStockContexts(tx, contexts);
            });
        }
        logger.info(`[ThemeContext] Theme ${themeId} 가공 완료`);
    }

    /**
     * 등락률 구간별 종목 수 계산
     */
    private calculateRateStats(features: any[]) {
        const stats: Record<string, number> = {};

        // 초기화
        STAT_RATES.forEach(r => stats[`cnt${r}RateStockNum`] = 0);

        features.forEach(f => {
            const rate = Number(f.closeRateNxt);
            STAT_RATES.forEach(r => {
                if (rate >= r) stats[`cnt${r}RateStockNum`]++;
            });
        });

        return stats;
    }

    /**
     * [분리] 거래대금 구간별 종목 수 계산
     */
    private calculateAmountStats(features: any[]) {
        const stats: Record<string, number> = {};

        // 초기화
        STAT_AMOUNTS.forEach(a => stats[`cnt${a}AmtStockNum`] = 0);

        features.forEach(f => {
            const amt = Number(f.tradingAmount) / 100000000; // 단위: 억
            STAT_AMOUNTS.forEach(a => {
                if (amt >= a) stats[`cnt${a}AmtStockNum`]++;
            });
        });

        return stats;
    }
}