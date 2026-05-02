import { and, eq, asc, sql } from "drizzle-orm";
import {
    minuteCandles,
    dailyCandles,
    type MinuteCandle,
} from "@trade-data-manager/market-data";
import {
    minuteCandleFeatures,
    type Database,
} from "@trade-data-manager/feature-engine";

export class ProcessorRepository {
    constructor(private readonly db: Database) { }

    /**
     * 특정 날짜에 분봉이 존재하는 종목 코드 목록.
     */
    async getStockCodesForDate(tradeDate: string): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ stockCode: minuteCandles.stockCode })
            .from(minuteCandles)
            .where(eq(minuteCandles.tradeDate, tradeDate));
        return rows.map((r) => r.stockCode);
    }

    /**
     * 한 종목의 하루치 분봉 (시간 ASC).
     * dailyCandleId도 함께 가져와서 features insert 시 활용.
     */
    async getMinuteCandlesForDay(
        stockCode: string,
        tradeDate: string
    ): Promise<MinuteCandle[]> {
        return this.db
            .select()
            .from(minuteCandles)
            .where(
                and(
                    eq(minuteCandles.stockCode, stockCode),
                    eq(minuteCandles.tradeDate, tradeDate)
                )
            )
            .orderBy(asc(minuteCandles.tradeTime));
    }

    /**
     * 분봉 피처 배치 INSERT (UPSERT).
     * 동일 minuteCandleId가 있으면 모든 컬럼 갱신 (재가공 대응).
     */
    async saveMinuteFeatures(
        rows: Array<Record<string, any>>
    ): Promise<void> {
        if (rows.length === 0) return;

        // 청크 단위로 나눠 INSERT (PostgreSQL 파라미터 한도 회피)
        const CHUNK_SIZE = 500;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            await this.db
                .insert(minuteCandleFeatures)
                .values(chunk as any)
                .onConflictDoUpdate({
                    target: minuteCandleFeatures.minuteCandleId,
                    set: this.buildUpdateSet(chunk[0]),
                });
        }
    }

    /**
     * ON CONFLICT DO UPDATE 시 갱신할 컬럼 set 구성.
     * id, minuteCandleId, dailyCandleId, createdAt 제외.
     */
    private buildUpdateSet(sample: Record<string, any>) {
        const excluded = new Set([
            "id",
            "minuteCandleId",
            "dailyCandleId",
            "createdAt",
        ]);
        const set: Record<string, any> = {};
        for (const key of Object.keys(sample)) {
            if (excluded.has(key)) continue;
            // EXCLUDED 테이블 참조 (PostgreSQL UPSERT 표준)
            set[key] = sql.raw(`excluded.${this.toSnakeCase(key)}`);
        }
        // updatedAt 갱신
        set.updatedAt = sql`now()`;
        return set;
    }

    private toSnakeCase(camel: string): string {
        return camel.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    }

    /**
     * 분봉 데이터가 존재하는 모든 거래일.
     */
    async getAllTradeDates(): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ tradeDate: minuteCandles.tradeDate })
            .from(minuteCandles)
            .orderBy(asc(minuteCandles.tradeDate));
        return rows.map((r) => r.tradeDate);
    }

    /**
     * 아직 minute_candle_features에 가공되지 않은 거래일.
     * (분봉은 있지만 features는 없는 날짜)
     */
    async getPendingTradeDates(): Promise<string[]> {
        const result = await this.db.execute(sql`
            SELECT DISTINCT mc.trade_date
            FROM minute_candles mc
            LEFT JOIN minute_candle_features mcf
              ON mcf.minute_candle_id = mc.id
            WHERE mcf.id IS NULL
            ORDER BY mc.trade_date ASC
        `);
        return (result.rows as Array<{ trade_date: string }>).map(
            (r) => r.trade_date
        );
    }
}
