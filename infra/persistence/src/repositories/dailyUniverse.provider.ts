import { eq } from "drizzle-orm";
import type { DailyUniverseProvider } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { minuteCandles } from "../schema/market.js";

/**
 * Drizzle 구현 — 그 거래일 분봉이 있는 종목코드 distinct(=당일 universe).
 * 분봉 repo(save/get)와 책임이 달라(읽기 전용 집계) 별도 클래스로 분리. 별도 랭킹 테이블 없음.
 */
export class DrizzleDailyUniverseProvider implements DailyUniverseProvider {
    constructor(private readonly db: Database) {}

    async stockCodesByDate(date: string): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ stockCode: minuteCandles.stockCode })
            .from(minuteCandles)
            .where(eq(minuteCandles.tradeDate, date));
        return rows.map((r) => r.stockCode);
    }
}
