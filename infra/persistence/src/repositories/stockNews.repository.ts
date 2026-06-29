import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { DateRange, NewsHeadline, StockNewsRepository } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { stockNews } from "../schema/market.js";
import { newsHeadlineToRows, rowToNewsHeadline } from "../mappers/news.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(stockNews, ["stockCode", "publishedDate", "srno"]);

/** Drizzle 구현 — (stockCode, publishedDate, srno) 자연키 upsert + (종목,기간) 시계열 조회. */
export class DrizzleStockNewsRepository implements StockNewsRepository {
    constructor(private readonly db: Database) {}

    async saveHeadlines(headlines: NewsHeadline[]): Promise<void> {
        if (headlines.length === 0) return;
        const rows = headlines.flatMap(newsHeadlineToRows);
        if (rows.length === 0) return;
        // 뉴스는 published_date 월별 RANGE 파티션 → 들어올 달의 파티션을 INSERT 전에 보장(멱등).
        const months = new Set(rows.map((r) => `${r.publishedDate.slice(0, 7)}-01`));
        for (const month of months) {
            await this.db.execute(sql`SELECT "market".ensure_stock_news_partition(${month}::date)`);
        }
        await this.db
            .insert(stockNews)
            .values(rows)
            .onConflictDoUpdate({
                target: [stockNews.stockCode, stockNews.publishedDate, stockNews.srno],
                set: CONFLICT_SET,
            });
    }

    async getHeadlines(stockCode: string, range: DateRange): Promise<NewsHeadline[]> {
        const rows = await this.db
            .select()
            .from(stockNews)
            .where(
                and(
                    eq(stockNews.stockCode, stockCode),
                    gte(stockNews.publishedDate, range.from),
                    lte(stockNews.publishedDate, range.to),
                ),
            )
            .orderBy(asc(stockNews.publishedDate), asc(stockNews.publishedTime));
        return rows.map(rowToNewsHeadline);
    }
}
