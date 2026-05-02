import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import {
    MINUTE_CALCULATORS,
    mergeCalculatorOutputs,
    type MinuteCandleContext,
} from "@trade-data-manager/feature-engine";
import type { MinuteCandle } from "@trade-data-manager/market-data";
import { ProcessorRepository } from "../repository/processorRepository";
import { logger } from "../logger";

dayjs.extend(customParseFormat);

export interface MinuteRunnerOptions {
    tradeDate: string;
}

/**
 * 한 거래일의 모든 종목에 대해 분봉 피처를 가공하여 저장.
 */
export async function runMinuteFeatures(
    repo: ProcessorRepository,
    opts: MinuteRunnerOptions
): Promise<{ stockCount: number; rowCount: number }> {
    const { tradeDate } = opts;
    const stockCodes = await repo.getStockCodesForDate(tradeDate);
    logger.info(`[minuteRunner] ${tradeDate}: ${stockCodes.length} stocks`);

    let totalRows = 0;
    let processed = 0;

    for (const stockCode of stockCodes) {
        const candles = await repo.getMinuteCandlesForDay(stockCode, tradeDate);
        if (candles.length === 0) continue;

        const rows = computeStockFeatures(candles);
        await repo.saveMinuteFeatures(rows);

        totalRows += rows.length;
        processed++;

        if (processed % 50 === 0) {
            logger.info(
                `[minuteRunner]   progress: ${processed}/${stockCodes.length}`
            );
        }
    }

    logger.info(
        `[minuteRunner] ${tradeDate} done: ${processed} stocks, ${totalRows} rows`
    );
    return { stockCount: processed, rowCount: totalRows };
}

/**
 * 한 종목의 하루치 분봉을 모든 Calculator로 가공.
 */
function computeStockFeatures(
    candles: MinuteCandle[]
): Array<Record<string, any>> {
    // 종목 단위로 모든 stateful Calculator 초기화
    for (const calc of MINUTE_CALCULATORS) {
        calc.reset?.();
    }

    const rows: Array<Record<string, any>> = [];

    for (let i = 0; i < candles.length; i++) {
        const ctx: MinuteCandleContext = {
            current: candles[i],
            candles,
            index: i,
            findCandleMinutesAgo: (minutesAgo) =>
                findCandleMinutesAgo(candles, i, minutesAgo),
        };

        // 모든 Calculator 실행 → 결과 머지
        const outputs = MINUTE_CALCULATORS.map((calc) => calc.calculate(ctx));
        const merged = mergeCalculatorOutputs(outputs);

        // FK 컬럼 채우기 (Calculator가 다루지 않는 메타)
        merged.minuteCandleId = candles[i].id;
        merged.dailyCandleId = candles[i].dailyCandleId;

        rows.push(merged);
    }

    return rows;
}

/**
 * "현재로부터 N분 이전"에 해당하는 가장 가까운 과거 캔들 반환.
 * 동일 종목/날짜 배열에서만 검색하므로 O(N) 선형 검색이지만,
 * 분봉 N개당 5회 호출(5/10/30/60/120) 정도라 실질 영향 미미.
 */
function findCandleMinutesAgo(
    candles: MinuteCandle[],
    currentIndex: number,
    minutesAgo: number
): MinuteCandle | null {
    const current = candles[currentIndex];
    const target = dayjs(current.tradeTime, "HH:mm:ss").subtract(
        minutesAgo,
        "minute"
    );

    // currentIndex 이전 중에서 target 시각 이하인 가장 늦은 캔들
    for (let j = currentIndex - 1; j >= 0; j--) {
        const t = dayjs(candles[j].tradeTime, "HH:mm:ss");
        if (t.isSame(target) || t.isBefore(target)) {
            return candles[j];
        }
    }
    return null;
}
