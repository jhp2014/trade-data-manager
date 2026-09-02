import { and, desc, inArray, lt, sql } from "drizzle-orm";
import type {
    DailyMarketCap,
    DailyMarketCapReader,
    DailyStockStat,
    DailyStockStatStore,
    DateRange,
    MissingStatFill,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { dailyMarketCap } from "../schema/market.js";
import { dailyStatToRow, rowToMarketCap } from "../mappers/marketCap.js";
import { buildConflictUpdateSet } from "./_helpers.js";

/** 3컬럼 전부 갱신(자연키 제외). */
const STAT_CONFLICT_SET = buildConflictUpdateSet(dailyMarketCap, ["stockCode", "tradeDate"]);

/** Drizzle 구현 — (stockCode, tradeDate) upsert. 별 테이블이라 일봉 자가치유와 독립. */
export class DrizzleDailyMarketCapRepository implements DailyMarketCapReader, DailyStockStatStore {
    constructor(private readonly db: Database) {}

    async saveDailyStats(rows: DailyStockStat[]): Promise<void> {
        if (rows.length === 0) return;
        await this.db
            .insert(dailyMarketCap)
            .values(rows.map(dailyStatToRow))
            .onConflictDoUpdate({
                target: [dailyMarketCap.stockCode, dailyMarketCap.tradeDate],
                set: STAT_CONFLICT_SET,
            });
    }

    /**
     * 소스 누락분 메우기. "그날 거래했다"의 판정은 **일봉 존재**다 — 일봉이 없는 (종목,날)은
     * 애초에 대상이 아니다(주말·휴장일·상장 전 기간이라 채울 값도 뜻도 없다).
     *
     * 채우는 건 **그 종목의 마지막 거래일뿐**이다 — 조건 둘을 동시에 요구한다:
     *   ① 그 종목의 일봉이 그 뒤로 없다(그 종목은 거기서 멈췄다)
     *   ② 시장의 일봉은 그 뒤로 있다(장은 계속 돌았다)
     * 둘이 함께여야 "상장폐지·스팩 소멸"이고, 그래야 주식수 불변이 보장된다.
     * ⚠ ②가 없으면 **수집 최신일이 늘 마지막 날로 오인된다** — 야간 수집이 그날 소스 호출에 실패하면
     *   그날 거래한 전 종목이 구멍이 되고 전부 `직전 주식수 × 그날 종가`로 조용히 박힌다(그중 재상장
     *   종목은 배수만큼 틀린다). "시총 테이블의 끝"과 "그 종목의 끝"은 다른 사건이라 일봉으로 판정한다.
     * 나머지 구멍(중간 구멍 = 재상장 당일 가능, 수집 실패일)은 채우지 않고 센다(unresolved).
     *
     * 삽입 건수는 RETURNING 으로 센다 — 드라이버마다 갱신 행수 필드가 다르다(node-postgres 는
     * rowCount, pglite 는 affectedRows). rows.length 는 양쪽에서 같다.
     */
    async fillMissingTradedDays(range: DateRange): Promise<MissingStatFill> {
        const inserted = await this.db.execute<{ stock_code: string }>(sql`
            INSERT INTO "market"."daily_market_cap" ("stock_code","trade_date","market_cap","list_shares")
            SELECT c."stock_code", c."trade_date", p."list_shares" * r."close_krx", p."list_shares"
              FROM "market"."daily_candles" c
              JOIN "market"."daily_candles_raw" r
                ON r."stock_code" = c."stock_code" AND r."trade_date" = c."trade_date"
              JOIN LATERAL (
                   SELECT m."list_shares" FROM "market"."daily_market_cap" m
                    WHERE m."stock_code" = c."stock_code" AND m."trade_date" < c."trade_date"
                    ORDER BY m."trade_date" DESC LIMIT 1) p ON TRUE
             WHERE c."trade_date" BETWEEN ${range.from} AND ${range.to}
               AND r."close_krx" > 0
               AND NOT EXISTS (SELECT 1 FROM "market"."daily_market_cap" x
                                WHERE x."stock_code" = c."stock_code" AND x."trade_date" = c."trade_date")
               AND NOT EXISTS (SELECT 1 FROM "market"."daily_candles" own
                                WHERE own."stock_code" = c."stock_code" AND own."trade_date" > c."trade_date")
               AND EXISTS (SELECT 1 FROM "market"."daily_candles" mkt
                            WHERE mkt."trade_date" > c."trade_date")
            RETURNING "stock_code"
        `);
        // 남은 구멍 = 위 조건에 안 걸린 것(이후 거래가 있거나, 직전 행이 없거나, 종가가 0, 수집 최신일).
        const rest = await this.db.execute<{ n: number }>(sql`
            SELECT COUNT(*)::int AS n FROM "market"."daily_candles" c
             WHERE c."trade_date" BETWEEN ${range.from} AND ${range.to}
               AND NOT EXISTS (SELECT 1 FROM "market"."daily_market_cap" x
                                WHERE x."stock_code" = c."stock_code" AND x."trade_date" = c."trade_date")
        `);
        return { inherited: inserted.rows.length, unresolved: rest.rows[0]?.n ?? 0 };
    }

    /**
     * 종목별 "date 직전 최신 1행" — DISTINCT ON 으로 한 쿼리에 끝낸다(코드 수만큼 쿼리를 내지 않는다).
     * PK (stock_code, trade_date) 가 그대로 정렬 순서라 인덱스만으로 처리된다.
     */
    async getPreviousByDateAndCodes(date: string, codes: string[]): Promise<DailyMarketCap[]> {
        if (codes.length === 0) return [];
        const rows = await this.db
            .selectDistinctOn([dailyMarketCap.stockCode])
            .from(dailyMarketCap)
            .where(and(lt(dailyMarketCap.tradeDate, date), inArray(dailyMarketCap.stockCode, codes)))
            .orderBy(dailyMarketCap.stockCode, desc(dailyMarketCap.tradeDate));
        return rows.map(rowToMarketCap);
    }
}
