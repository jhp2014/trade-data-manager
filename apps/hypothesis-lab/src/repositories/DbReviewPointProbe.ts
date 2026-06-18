import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { OrphanCase, ReconcileCase, ReviewPointProbe } from "./ReviewPointProbe";

/**
 * data-core(public) 테이블을 raw SQL 로 read-only 조회한다.
 * data-core 패키지에 의존하지 않고 같은 DB 인스턴스의 public schema 만 읽는다.
 */
export class DbReviewPointProbe implements ReviewPointProbe {
    constructor(private readonly db: Database) {}

    async findOrphans(cases: ReconcileCase[]): Promise<OrphanCase[]> {
        if (cases.length === 0) return [];

        const codes = [...new Set(cases.map((c) => c.stockCode))];
        const dates = [...new Set(cases.map((c) => c.tradeDate))];

        // 후보 종목/일자로 범위를 좁혀 review_point 와 review_target 을 가져온다(occasional 점검).
        const pointRes = await this.db.execute(sql`
            SELECT rt.stock_code AS stock_code,
                   rt.trade_date::text AS trade_date,
                   to_char(rp.trade_time, 'HH24:MI') AS hhmm
            FROM public.review_target rt
            JOIN public.review_point rp ON rp.review_target_id = rt.id
            WHERE rt.stock_code IN ${codes} AND rt.trade_date::text IN ${dates}
        `);
        const targetRes = await this.db.execute(sql`
            SELECT stock_code AS stock_code, trade_date::text AS trade_date
            FROM public.review_target
            WHERE stock_code IN ${codes} AND trade_date::text IN ${dates}
        `);

        const pointSet = new Set(
            rowsOf(pointRes).map((r) => `${r.stock_code}|${r.trade_date}|${r.hhmm}`),
        );
        const targetSet = new Set(
            rowsOf(targetRes).map((r) => `${r.stock_code}|${r.trade_date}`),
        );

        return cases.filter((c) => {
            if (c.tradeTime) {
                return !pointSet.has(`${c.stockCode}|${c.tradeDate}|${c.tradeTime.slice(0, 5)}`);
            }
            return !targetSet.has(`${c.stockCode}|${c.tradeDate}`);
        });
    }
}

type Row = Record<string, string>;

/** node-postgres 는 결과에 .rows, 일부 드라이버는 배열을 직접 반환 — 양쪽 처리. */
function rowsOf(res: unknown): Row[] {
    const maybe = res as { rows?: Row[] };
    if (Array.isArray(maybe.rows)) return maybe.rows;
    return Array.isArray(res) ? (res as Row[]) : [];
}
