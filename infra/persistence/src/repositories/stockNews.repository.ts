import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { DateRange, HeadlineFeedOptions, NewsHeadline, StockNewsStore, StockNewsReader } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { stockNews } from "../schema/market.js";
import { newsHeadlineToRows, rowToNewsHeadline } from "../mappers/news.js";
import { buildConflictUpdateSet } from "./_helpers.js";

const CONFLICT_SET = buildConflictUpdateSet(stockNews, ["stockCode", "publishedDate", "srno"]);

/** Drizzle 구현 — (stockCode, publishedDate, srno) 자연키 upsert + (종목,기간) 시계열 조회. */
export class DrizzleStockNewsRepository implements StockNewsStore, StockNewsReader {
    constructor(private readonly db: Database) {}

    async saveHeadlines(headlines: NewsHeadline[]): Promise<void> {
        if (headlines.length === 0) return;
        // 배치 내 PK((stock_code, published_date, srno)) 중복 제거 — KIS 가 한 페이지에 같은 srno 를
        // 중복 반환할 때(새벽 sparse/wrap 구간) ON CONFLICT 가 같은 행을 두 번 못 건드려 나는 에러 방지.
        const byKey = new Map<string, ReturnType<typeof newsHeadlineToRows>[number]>();
        for (const r of headlines.flatMap(newsHeadlineToRows)) {
            byKey.set(`${r.stockCode}|${r.publishedDate}|${r.srno}`, r);
        }
        const rows = [...byKey.values()];
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

    async feedHeadlines(opts: HeadlineFeedOptions): Promise<NewsHeadline[]> {
        const { stockCode, titleKeyword, before, onOrBefore, limit } = opts;
        const conds: (SQL | undefined)[] = [];
        if (stockCode !== undefined) conds.push(eq(stockNews.stockCode, stockCode));
        if (titleKeyword) conds.push(ilike(stockNews.title, `%${escapeLike(titleKeyword)}%`));
        // 복합 커서 (publishedDate, srno) 엄격 미만: date < d OR (date = d AND srno < s).
        // srno 는 bigint 컬럼이라 문자열 커서를 BigInt 로 변환해 비교한다.
        if (before) {
            conds.push(
                or(
                    lt(stockNews.publishedDate, before.publishedDate),
                    and(eq(stockNews.publishedDate, before.publishedDate), lt(stockNews.srno, BigInt(before.srno))),
                ),
            );
        } else if (onOrBefore) {
            conds.push(lte(stockNews.publishedDate, onOrBefore));
        }
        const where = and(...conds);
        const order = [desc(stockNews.publishedDate), desc(stockNews.srno)];
        // 전체(종목 미지정) = 한 헤드라인이 종목 수만큼 펼쳐진 행을 srno 단위로 접는다.
        // DISTINCT ON 은 ORDER BY 선두와 같은 (publishedDate, srno) — 어느 태깅 행이 남는지는 무관(제목·시각 동일).
        const rows =
            stockCode === undefined
                ? await this.db.selectDistinctOn([stockNews.publishedDate, stockNews.srno]).from(stockNews).where(where).orderBy(...order).limit(limit)
                : await this.db.select().from(stockNews).where(where).orderBy(...order).limit(limit);
        return rows.map(rowToNewsHeadline);
    }
}

/** ILIKE 패턴 이스케이프 — 사용자 키워드의 %/_/\ 를 리터럴로. */
function escapeLike(raw: string): string {
    return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}
