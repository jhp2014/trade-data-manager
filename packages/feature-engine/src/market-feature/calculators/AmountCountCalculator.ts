import { integer } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, MinuteCandleContext } from "../types";

/**
 * [AmountCountCalculator]
 * 특정 거래대금 임계값(억 단위)을 분봉 거래대금이 돌파한 누적 횟수.
 *
 *   new AmountCountCalculator(20)  → cnt20Amt
 *   new AmountCountCalculator(30)  → cnt30Amt
 *
 * ⚠️ stateful.
 */
export class AmountCountCalculator implements MinuteFeatureCalculator {
    private count = 0;

    constructor(private readonly thresholdEok: number) { }

    private get tsName() {
        return `cnt${this.thresholdEok}Amt`;
    }
    private get dbName() {
        return `cnt_${this.thresholdEok}_amt`;
    }

    reset() {
        this.count = 0;
    }

    columns() {
        return {
            [this.tsName]: integer(this.dbName).notNull().default(0),
        };
    }

    calculate(ctx: MinuteCandleContext) {
        const curEok = Number(ctx.current.tradingAmount ?? "0") / 1e8;
        if (curEok >= this.thresholdEok) this.count++;
        return { [this.tsName]: this.count };
    }
}
