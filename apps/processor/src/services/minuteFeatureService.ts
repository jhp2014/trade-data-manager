import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { processorRepository } from "../db/processorRepository.js";
import { logger } from "../utils/logger.js";
import { STAT_AMOUNTS, type MinuteCandleFeaturesInsert } from "@trade-data-manager/database";

// dayjs 시간 파싱을 위한 플러그인 등록
dayjs.extend(customParseFormat);

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
            const amtCounts: Record<number, number> = {};
            STAT_AMOUNTS.forEach(a => amtCounts[a] = 0);

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

                // N분 전 대비 변동률 계산 (실제 시간 기준 탐색)
                const getRate = (minutesAgo: number) => {
                    // 1. 현재 캔들 시간에서 N분 전 시간을 계산 (예: "09:05:00" -> "09:00:00")
                    const targetTime = dayjs(cur.tradeTime, "HH:mm:ss")
                        .subtract(minutesAgo, 'minute')
                        .format("HH:mm:ss");

                    // 2. 현재 캔들 이전(i-1)부터 역순으로 탐색하여 targetTime과 같거나 과거인 가장 최신 캔들을 찾음
                    let targetCandle = null;
                    for (let j = i - 1; j >= 0; j--) {
                        if (candles[j].tradeTime <= targetTime) {
                            targetCandle = candles[j];
                            break;
                        }
                    }

                    // 3. 장 시작 직후라서 N분 전 데이터가 없으면 null 반환
                    if (!targetCandle) return null;

                    // 4. 변동률 계산
                    return (Number(cur.closeRateNxt) - Number(targetCandle.closeRateNxt)).toFixed(2);
                }

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

                    // 💡 [수정된 부분] 단순히 인덱스를 빼는 게 아니라 실제 N분(minute)을 인자로 전달
                    changeRate5m: getRate(5),
                    changeRate10m: getRate(10),
                    changeRate30m: getRate(30),
                    changeRate60m: getRate(60),
                    changeRate120m: getRate(120),

                    // 고점 정보
                    dayHighRate: dayHighRate.toFixed(4),
                    dayHighTime: dayHighTime,
                    pullbackFromDayHigh: pullback.toFixed(4),
                    minutesSinceDayHigh: dayHighTime
                        ? dayjs(cur.tradeTime, "HH:mm:ss").diff(
                            dayjs(dayHighTime, "HH:mm:ss"),
                            "minute"
                          )
                        : 0,

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