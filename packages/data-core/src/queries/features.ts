import type { Database } from "../db";
import {
    findAllTradeDates,
    findPendingTradeDates,
} from "../repositories/market-feature.repository";

/**
 * 분봉이 기록된 모든 거래일 (ASC).
 */
export function getAllTradeDates(db: Database): Promise<string[]> {
    return findAllTradeDates(db);
}

/**
 * 아직 분봉 피처가 가공되지 않은 거래일 (ASC).
 */
export function getPendingTradeDates(db: Database): Promise<string[]> {
    return findPendingTradeDates(db);
}
