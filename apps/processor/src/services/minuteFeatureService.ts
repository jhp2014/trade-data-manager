import { processorRepository } from "../db/processorRepository.js";
import { logger } from "../utils/logger.js";
import type { MinuteCandleFeaturesInsert } from "@trade-data-manager/database";

export class MinuteFeatureService {
    /**
     * 특정 종목의 하루치 분봉을 가공하여 minute_candle_features 테이블에 저장합니다.
     */
    async processStockFeatures(stockCode: string, tradeDate: string) {
        try {
            // 1. 레포지토리에서 시간순(ASC)으로 정렬된 분봉 가져오기
            const candles = await processorRepository.getMinuteCandlesForDay(stockCode, tradeDate);
            if (candles.length === 0) return;

            // 2. 가공 데이터를 담을 배열 및 누적 상태 변수
            const featuresList: MinuteCandleFeaturesInsert[] = [];
            let dayHighRate = 0;
            let dayHighTime = "";
            let cumulativeAmt = 0;

            // 거래대금 구간별 횟수 누적을 위한 객체
            const amtCounts: Record<number, number> = {
                20: 0, 30: 0, 40: 0, 50: 0, 60: 0, 70: 0, 80: 0, 90: 0,
                100: 0, 120: 0, 140: 0, 160: 0, 180: 0, 200: 0, 250: 0, 300: 0
            };

            // 3. 단일 루프로 모든 지표 계산 (O(N))
            for (let i = 0; i < candles.length; i++) {
                const cur = candles[i];
                const curAmt = Number(cur.tradingAmount);



                // A. 당일 고가 갱신 및 시간 기록
                if (Number(cur.highRateNxt) > dayHighRate) {
                    dayHighRate = Number(cur.highRateNxt);
                    dayHighTime = cur.tradeTime;
                }

                // B. 고점 대비 눌림목(Pullback) 및 경과 시간 계산
                const pullback = dayHighRate > 0
                    ? Number(cur.closeRateNxt) - dayHighRate
                    : 0;

                // C. N분 전 대비 변동률 계산 (배열 인덱스 활용)
                const getRate = (prevIdx: number) => {
                    if (prevIdx < 0) return null;
                    return (Number(cur.closeRateNxt) - Number(candles[prevIdx].closeRateNxt)).toFixed(2);
                };

                // D. 거래대금 구간별 돌파 횟수 누적 (단위: 억)
                const curAmtInEok = curAmt / 100000000;
                Object.keys(amtCounts).forEach(threshold => {
                    if (curAmtInEok >= Number(threshold)) {
                        amtCounts[Number(threshold)]++;
                    }
                });

                cumulativeAmt += curAmt;

                // E. 데이터 조립 (Insert Object 생성)
                const feature: MinuteCandleFeaturesInsert = {
                    minuteCandleId: cur.id,
                    dailyCandleId: cur.dailyCandleId,
                    tradeDate: cur.tradeDate,
                    tradeTime: cur.tradeTime,
                    stockCode: cur.stockCode,
                    closeRateKrx: cur.closeRateKrx ?? "0",
                    closeRateNxt: cur.closeRateNxt ?? "0",
                    tradingAmount: cur.tradingAmount,
                    cumulativeTradingAmount: cumulativeAmt,

                    // N분전 변동률
                    changeRate5m: getRate(i - 5),
                    changeRate10m: getRate(i - 10),
                    changeRate30m: getRate(i - 30),
                    changeRate60m: getRate(i - 60),
                    changeRate120m: getRate(i - 120),

                    // 고점 정보
                    dayHighRate: ((dayHighRate - Number(cur.open)) / Number(cur.open) * 100).toFixed(4), // 예시
                    dayHighTime: dayHighTime,
                    pullbackFromDayHigh: pullback.toFixed(4),
                    minutesSinceDayHigh: i - candles.findIndex(c => c.tradeTime === dayHighTime),

                    // 거래대금 횟수 (헬퍼 함수가 생성한 컬럼명에 맞춤)
                    ...this.mapAmtCounts(amtCounts)
                };

                featuresList.push(feature);
            }

            // 4. Bulk Upsert 실행
            await processorRepository.saveMinuteFeatures(featuresList);
            logger.info(`[MinuteFeature] ${stockCode} ${tradeDate} 가공 완료 (${featuresList.length}건)`);

        } catch (error) {
            logger.error(`[MinuteFeature] ${stockCode} 가공 중 에러:`, error);
        }
    }

    /**
     * amtCounts 객체를 스키마 컬럼명으로 변환
     */
    private mapAmtCounts(counts: Record<number, number>) {
        const result: any = {};
        Object.entries(counts).forEach(([amt, count]) => {
            result[`cnt${amt}Amt`] = count;
        });
        return result;
    }
}