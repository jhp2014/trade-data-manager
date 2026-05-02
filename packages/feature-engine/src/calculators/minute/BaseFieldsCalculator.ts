// 📝 BaseFieldsCalculator.ts (B안 버전 — 최종)
import { date, time, varchar, numeric } from "drizzle-orm/pg-core";
import type { MinuteFeatureCalculator, ColumnOptions, MinuteCandleContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

/**
 * [BaseFieldsCalculator]
 * raw 분봉에서 그대로 가져오는 기본 컬럼들을 정의/계산.
 * (PK, FK, createdAt 같은 테이블 메타데이터는 schema 정의에서 직접 추가)
 */
export class BaseFieldsCalculator implements MinuteFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix, nullable } = opts;
        const isSlot = !!prefix;

        // numeric은 .notNull()을 체이닝해서 받음. 슬롯이면 빼고.
        const num = (name: string, p: { precision: number; scale: number }) => {
            const col = numeric(dbKey(name, prefix), p);
            return isSlot || nullable ? col : col.notNull();
        };

        const cols: Record<string, any> = {
            [tsKey("closeRateKrx", prefix)]: num("close_rate_krx", { precision: 8, scale: 4 }),
            [tsKey("closeRateNxt", prefix)]: num("close_rate_nxt", { precision: 8, scale: 4 }),
            [tsKey("tradingAmount", prefix)]: num("trading_amount", { precision: 18, scale: 1 }),
        };

        // 메인 테이블(슬롯이 아닐 때)만 식별 메타 컬럼 포함
        if (!isSlot) {
            cols.tradeDate = date("trade_date").notNull();
            cols.tradeTime = time("trade_time").notNull();
            cols.stockCode = varchar("stock_code", { length: 10 }).notNull();
        }

        return cols;
    }

    calculate(ctx: MinuteCandleContext) {
        const c = ctx.current;
        return {
            tradeDate: c.tradeDate,
            tradeTime: c.tradeTime,
            stockCode: c.stockCode,
            closeRateKrx: c.closeRateKrx ?? "0",
            closeRateNxt: c.closeRateNxt ?? "0",
            tradingAmount: c.tradingAmount,
        };
    }
}
