import type { Database } from "../db";
import {
    findStockRegDayApiFormat,
} from "../repositories/stock.repository";

/**
 * 종목 상장일 (API 포맷 'YYYYMMDD').
 */
export function getStockRegDayApiFormat(
    db: Database,
    params: { stockCode: string },
): Promise<string | null> {
    return findStockRegDayApiFormat(db, params.stockCode);
}
