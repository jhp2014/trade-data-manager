import {
    bigserial,
    bigint,
    timestamp,
    index,
    unique,
} from "drizzle-orm/pg-core";
import {
    pgTable,
    minuteCandles,
    dailyCandles,
} from "@trade-data-manager/market-data";
import { buildColumnsFromCalculators } from "../helpers";
import { MINUTE_CALCULATORS } from "../calculators/minute";

/**
 * [MinuteCandleFeatures]
 * Calculator 배열로부터 자동 생성되는 분봉 피처 테이블.
 *
 * ⚠️ 컬럼 변경은 MINUTE_CALCULATORS 배열을 수정하세요.
 *
 * 💡 (table as any) 캐스팅:
 *    Calculator로 동적 생성된 컬럼은 TypeScript 타입 추론이 약해
 *    인덱스 정의 시 캐스팅이 필요합니다 (런타임 영향 없음).
 */
export const minuteCandleFeatures = pgTable(
    "minute_candle_features",
    {
        id: bigserial("id", { mode: "bigint" }).primaryKey(),
        minuteCandleId: bigint("minute_candle_id", { mode: "bigint" })
            .notNull()
            .references(() => minuteCandles.id, { onDelete: "cascade" }),
        dailyCandleId: bigint("daily_candle_id", { mode: "bigint" })
            .notNull()
            .references(() => dailyCandles.id, { onDelete: "cascade" }),

        ...buildColumnsFromCalculators(MINUTE_CALCULATORS),

        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => {
        const t = table as any;  // Calculator 동적 생성 컬럼 접근용
        return [
            unique("uq_minute_features_candle_id").on(table.minuteCandleId),
            index("idx_minute_features_date_code_time").on(
                t.tradeDate,
                t.stockCode,
                t.tradeTime
            ),
            index("idx_minute_features_pullback").on(t.pullbackFromDayHigh),
        ];
    }
);

export type MinuteCandleFeatures = typeof minuteCandleFeatures.$inferSelect;
export type MinuteCandleFeaturesInsert = typeof minuteCandleFeatures.$inferInsert;
