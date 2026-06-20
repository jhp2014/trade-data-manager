import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { composeCaseId, parseCaseId, type CaseIdParts } from "@/domain/caseId";
import type { ReviewCase, ReviewCaseSource } from "./ReviewCaseSource";

/**
 * data-core(public) 테이블을 raw SQL 로 read-only 조회한다.
 * data-core 패키지에 의존하지 않고 같은 DB 인스턴스의 public schema 만 읽는다.
 */
export class DbReviewCaseSource implements ReviewCaseSource {
    constructor(private readonly db: Database) {}

    async enrich(caseIds: string[]): Promise<ReviewCase[]> {
        const parsed = parseAll(caseIds).filter((p) => p.parts !== null) as ParsedValid[];
        if (parsed.length === 0) return [];

        const { pointMap, targetMap } = await this.loadMaps(
            unique(parsed.map((p) => p.parts.stockCode)),
            unique(parsed.map((p) => p.parts.tradeDate)),
        );

        const out: ReviewCase[] = [];
        for (const { caseId, parts } of parsed) {
            if (parts.tradeTime) {
                const key = `${parts.stockCode}|${parts.tradeDate}|${parts.tradeTime.slice(0, 5)}`;
                if (pointMap.has(key)) {
                    out.push(reviewCase(caseId, parts, pointMap.get(key) ?? null));
                }
            } else {
                const key = `${parts.stockCode}|${parts.tradeDate}`;
                if (targetMap.has(key)) {
                    out.push(reviewCase(caseId, parts, targetMap.get(key) ?? null));
                }
            }
        }
        return out;
    }

    async findOrphans(caseIds: string[]): Promise<string[]> {
        if (caseIds.length === 0) return [];
        const parsed = parseAll(caseIds);
        const valid = parsed.filter((p) => p.parts !== null) as ParsedValid[];

        const { pointMap, targetMap } = valid.length
            ? await this.loadMaps(
                  unique(valid.map((p) => p.parts.stockCode)),
                  unique(valid.map((p) => p.parts.tradeDate)),
              )
            : { pointMap: new Map<string, string | null>(), targetMap: new Map<string, string | null>() };

        const orphans: string[] = [];
        for (const { caseId, parts } of parsed) {
            if (parts === null) {
                orphans.push(caseId); // 형식 불량 → 실재 불가
                continue;
            }
            const exists = parts.tradeTime
                ? pointMap.has(`${parts.stockCode}|${parts.tradeDate}|${parts.tradeTime.slice(0, 5)}`)
                : targetMap.has(`${parts.stockCode}|${parts.tradeDate}`);
            if (!exists) orphans.push(caseId);
        }
        return orphans;
    }

    async listRecent(limit: number): Promise<ReviewCase[]> {
        const res = await this.db.execute(sql`
            SELECT rt.stock_code AS stock_code, rt.trade_date::text AS trade_date,
                   rt.stock_name AS stock_name, to_char(rp.trade_time, 'HH24:MI') AS hhmm
            FROM public.review_target rt
            JOIN public.review_point rp ON rp.review_target_id = rt.id
            ORDER BY rt.trade_date DESC, rp.trade_time DESC
            LIMIT ${limit}
        `);
        return rowsOf(res).map(rowToReviewCase);
    }

    async listByRange(from: string, to: string): Promise<ReviewCase[]> {
        const res = await this.db.execute(sql`
            SELECT rt.stock_code AS stock_code, rt.trade_date::text AS trade_date,
                   rt.stock_name AS stock_name, to_char(rp.trade_time, 'HH24:MI') AS hhmm
            FROM public.review_target rt
            JOIN public.review_point rp ON rp.review_target_id = rt.id
            WHERE rt.trade_date BETWEEN ${from}::date AND ${to}::date
            ORDER BY rt.trade_date DESC, rp.trade_time DESC
        `);
        return rowsOf(res).map(rowToReviewCase);
    }

    /** 후보 종목/일자로 범위를 좁혀 point(시각 단위)·target(일자 단위) 맵을 만든다. */
    private async loadMaps(codes: string[], dates: string[]) {
        const pointRes = await this.db.execute(sql`
            SELECT rt.stock_code AS stock_code, rt.trade_date::text AS trade_date,
                   rt.stock_name AS stock_name, to_char(rp.trade_time, 'HH24:MI') AS hhmm
            FROM public.review_target rt
            JOIN public.review_point rp ON rp.review_target_id = rt.id
            WHERE rt.stock_code IN ${codes} AND rt.trade_date::text IN ${dates}
        `);
        const targetRes = await this.db.execute(sql`
            SELECT stock_code AS stock_code, trade_date::text AS trade_date, stock_name AS stock_name
            FROM public.review_target
            WHERE stock_code IN ${codes} AND trade_date::text IN ${dates}
        `);

        const pointMap = new Map<string, string | null>();
        for (const r of rowsOf(pointRes)) {
            pointMap.set(`${r.stock_code}|${r.trade_date}|${r.hhmm}`, r.stock_name);
        }
        const targetMap = new Map<string, string | null>();
        for (const r of rowsOf(targetRes)) {
            targetMap.set(`${r.stock_code}|${r.trade_date}`, r.stock_name);
        }
        return { pointMap, targetMap };
    }
}

type Row = Record<string, string | null>;
type ParsedValid = { caseId: string; parts: CaseIdParts };

function parseAll(caseIds: string[]): { caseId: string; parts: CaseIdParts | null }[] {
    return caseIds.map((caseId) => ({ caseId, parts: parseCaseId(caseId) }));
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function reviewCase(caseId: string, parts: CaseIdParts, stockName: string | null): ReviewCase {
    return {
        caseId,
        stockCode: parts.stockCode,
        stockName,
        tradeDate: parts.tradeDate,
        tradeTime: parts.tradeTime ? parts.tradeTime.slice(0, 5) : null,
    };
}

function rowToReviewCase(r: Row): ReviewCase {
    const stockCode = r.stock_code ?? "";
    const tradeDate = r.trade_date ?? "";
    const tradeTime = r.hhmm ?? null;
    return {
        caseId: composeCaseId({ stockCode, tradeDate, tradeTime }),
        stockCode,
        stockName: r.stock_name ?? null,
        tradeDate,
        tradeTime,
    };
}

/** node-postgres 는 결과에 .rows, 일부 드라이버는 배열을 직접 반환 — 양쪽 처리. */
function rowsOf(res: unknown): Row[] {
    const maybe = res as { rows?: Row[] };
    if (Array.isArray(maybe.rows)) return maybe.rows;
    return Array.isArray(res) ? (res as Row[]) : [];
}
