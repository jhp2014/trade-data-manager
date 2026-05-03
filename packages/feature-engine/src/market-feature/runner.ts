import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import type { MinuteCandle } from "@trade-data-manager/market-data";
import type { Database } from "../index";
import { MINUTE_CALCULATORS } from "./calculators";
import { mergeCalculatorOutputs } from "./helpers";
import type { MinuteCandleContext } from "./types";
import {
    getStockCodesForDate,
    getMinuteCandlesForDay,
    saveMinuteFeatures,
} from "./repository";

dayjs.extend(customParseFormat);

export interface MinuteRunnerOptions {
    db: Database;
    tradeDate: string;
}

export async function runMinuteFeatures(
    opts: MinuteRunnerOptions
): Promise<{ stockCount: number; rowCount: number }> {
    const { db, tradeDate } = opts;
    const stockCodes = await getStockCodesForDate(db, tradeDate);
    console.log(`[INFO] ${new Date().toISOString()} [minuteRunner] ${tradeDate}: ${stockCodes.length} stocks`);

    let totalRows = 0;
    let processed = 0;

    for (const stockCode of stockCodes) {
        const candles = await getMinuteCandlesForDay(db, stockCode, tradeDate);
        if (candles.length === 0) continue;

        const rows = computeStockFeatures(candles);
        await saveMinuteFeatures(db, rows);

        totalRows += rows.length;
        processed++;

        if (processed % 50 === 0) {
            console.log(
                `[INFO] ${new Date().toISOString()} [minuteRunner]   progress: ${processed}/${stockCodes.length}`
            );
        }
    }

    console.log(
        `[INFO] ${new Date().toISOString()} [minuteRunner] ${tradeDate} done: ${processed} stocks, ${totalRows} rows`
    );
    return { stockCount: processed, rowCount: totalRows };
}

function computeStockFeatures(candles: MinuteCandle[]): Array<Record<string, any>> {
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

        const outputs = MINUTE_CALCULATORS.map((calc) => calc.calculate(ctx));
        const merged = mergeCalculatorOutputs(outputs);

        merged.minuteCandleId = candles[i].id;
        merged.dailyCandleId = candles[i].dailyCandleId;

        rows.push(merged);
    }

    return rows;
}

function findCandleMinutesAgo(
    candles: MinuteCandle[],
    currentIndex: number,
    minutesAgo: number
): MinuteCandle | null {
    const current = candles[currentIndex];
    const target = dayjs(current.tradeTime, "HH:mm:ss").subtract(minutesAgo, "minute");

    for (let j = currentIndex - 1; j >= 0; j--) {
        const t = dayjs(candles[j].tradeTime, "HH:mm:ss");
        if (t.isSame(target) || t.isBefore(target)) {
            return candles[j];
        }
    }
    return null;
}
