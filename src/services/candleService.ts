import { kiwoomClient } from "@/clients/kiwoomClient";
import { db } from "@/db";
import { dailyCandles, minuteCandles, stocks } from "@/db/schema";
import { logger } from "@/utils/logger";
import {
    normalizeDailyCandle,
    normalizeMinuteCandle,
    normalizeStockInfo,
} from "@/services/normalizer";
import { eq, and, sql } from "drizzle-orm";
import type { KiwoomKa10081Response, KiwoomKa10080Response } from "@/clients/kiwoomClient";

type RawDailyCandle = KiwoomKa10081Response["stk_dt_pole_chart_qry"][number];
type RawMinuteCandle = KiwoomKa10080Response["stk_min_pole_chart_qry"][number];

// ============================================================
// Helpers
// ============================================================

/**
 * 일봉 데이터를 API로 조회합니다.
 * contYn === "Y"인 경우, 1회 추가 조회하여 두 페이지 분량을 합쳐서 반환합니다.
 */
async function fetchDailyCandles(
    stockCode: string,
    baseDate: string
): Promise<RawDailyCandle[]> {
    const res1 = await kiwoomClient.getDailyChart(stockCode, baseDate);
    const page1 = res1.data.stk_dt_pole_chart_qry ?? [];

    if (res1.contYn === "Y" && res1.nextKey) {
        logger.debug(`[fetchDailyCandles] ${stockCode} 연속조회 실행 (nextKey: ${res1.nextKey})`);
        const res2 = await kiwoomClient.getDailyChart(stockCode, baseDate, "Y", res1.nextKey);
        const page2 = res2.data.stk_dt_pole_chart_qry ?? [];
        // API는 최신 → 과거 순으로 내려주므로 그대로 붙임
        return [...page1, ...page2];
    }

    return page1;
}

/**
 * 분봉을 연속 조회합니다.
 * tradeDate(YYYYMMDD) 이전 날짜의 캔들이 감지되면 즉시 중단하고,
 * tradeDate 당일 분봉만 필터링하여 반환합니다.
 */
async function fetchMinuteCandlesForDate(
    stockCode: string,
    apiDate: string  // "YYYYMMDD" 형식
): Promise<RawMinuteCandle[]> {
    const collected: RawMinuteCandle[] = [];
    let contYn = "N";
    let nextKey = "";
    let done = false;

    do {
        const res = await kiwoomClient.getMinuteChart(stockCode, apiDate, contYn, nextKey);
        const candles = res.data.stk_min_pole_chart_qry ?? [];

        for (const candle of candles) {
            // cntr_tm 형식: "20250917132000" → 앞 8자리가 날짜
            const candleDate = candle.cntr_tm.slice(0, 8);

            if (candleDate === apiDate) {
                collected.push(candle);
            } else if (candleDate < apiDate) {
                // tradeDate 이전 날짜 발견 → 더 이상 조회 불필요
                done = true;
                break;
            }
            // candleDate > apiDate 인 경우는 있을 수 없지만 안전하게 skip
        }

        if (!done && res.contYn === "Y" && res.nextKey) {
            contYn = res.contYn;
            nextKey = res.nextKey;
            logger.debug(`[fetchMinuteCandlesForDate] ${stockCode} 연속조회 (nextKey: ${nextKey})`);
        } else {
            done = true;
        }
    } while (!done);

    return collected;
}

// ============================================================
// 1. 종목 정보 저장
// ============================================================

export async function upsertStock(stockCode: string): Promise<void> {
    logger.info(`[upsertStock] ${stockCode} 종목 정보 조회 중...`);

    const [infoRes, basicRes] = await Promise.all([
        kiwoomClient.getStockInfo(stockCode),
        kiwoomClient.getBasicInfo(stockCode),
    ]);

    const insert = normalizeStockInfo(infoRes.data, basicRes.data);

    await db
        .insert(stocks)
        .values(insert)
        .onConflictDoUpdate({
            target: stocks.stockCode,
            set: {
                stockName: insert.stockName,
                marketName: insert.marketName,
                isNxtAvailable: insert.isNxtAvailable,
            },
        });

    logger.info(`[upsertStock] ${stockCode} 저장 완료`);
}

// ============================================================
// 2. 일봉 저장
// ============================================================

/**
 * 특정 종목의 일봉을 KRX + NXT 기준으로 병렬 조회하여 DB에 저장합니다.
 *
 * - KRX / NXT 배열은 동일한 날짜·순서로 내려온다고 가정합니다.
 * - prevClose는 직전 캔들의 종가로 계산합니다.
 * - 가장 오래된 캔들(index 0)은 prevClose를 알 수 없으므로 저장하지 않습니다.
 *
 * @param stockCode - KRX 종목코드 (예: "005930")
 * @param baseDate  - 기준일 (예: "20241021"). 비어있으면 최근 데이터.
 */
export async function upsertDailyCandles(
    stockCode: string,
    baseDate: string = ""
): Promise<void> {
    logger.info(`[upsertDailyCandles] ${stockCode} 일봉 조회 시작 (baseDate: ${baseDate || "최근"})`);

    const stockCodeNxt = `${stockCode}_AL`;

    // KRX / NXT 병렬 조회 (각 최대 2페이지)
    const [krxCandles, nxtCandles] = await Promise.all([
        fetchDailyCandles(stockCode, baseDate),
        fetchDailyCandles(stockCodeNxt, baseDate),
    ]);

    if (krxCandles.length === 0 || nxtCandles.length === 0) {
        logger.warn(`[upsertDailyCandles] ${stockCode} 일봉 데이터 없음 (KRX: ${krxCandles.length}, NXT: ${nxtCandles.length})`);
        return;
    }

    logger.info(`[upsertDailyCandles] KRX ${krxCandles.length}개, NXT ${nxtCandles.length}개 수신`);

    const count = Math.min(krxCandles.length, nxtCandles.length);
    const rows = [];


    for (let i = 0; i < count - 1; i++) {
        const krxCandle = krxCandles[i];
        const nxtCandle = nxtCandles[i];

        const prevCloseKrx = krxCandles[i + 1].cur_prc;
        const prevCloseNxt = nxtCandles[i + 1].cur_prc;


        const row = normalizeDailyCandle(
            krxCandle,
            nxtCandle,
            stockCode,
            prevCloseKrx,
            prevCloseNxt
        );
        rows.push(row);
    }

    if (rows.length === 0) {
        logger.warn(`[upsertDailyCandles] ${stockCode} 저장할 캔들 없음 (최소 2개 필요)`);
        return;
    }

    // INSERT OR UPDATE (upsert)
    await db
        .insert(dailyCandles)
        .values(rows)
        .onConflictDoUpdate({
            target: [dailyCandles.tradeDate, dailyCandles.stockCode],
            set: {
                openKrx: sql`EXCLUDED.open_krx`,
                highKrx: sql`EXCLUDED.high_krx`,
                lowKrx: sql`EXCLUDED.low_krx`,
                closeKrx: sql`EXCLUDED.close_krx`,
                tradingVolumeKrx: sql`EXCLUDED.trading_volume_krx`,
                tradingAmountKrx: sql`EXCLUDED.trading_amount_krx`,
                openNxt: sql`EXCLUDED.open_nxt`,
                highNxt: sql`EXCLUDED.high_nxt`,
                lowNxt: sql`EXCLUDED.low_nxt`,
                closeNxt: sql`EXCLUDED.close_nxt`,
                tradingVolumeNxt: sql`EXCLUDED.trading_volume_nxt`,
                tradingAmountNxt: sql`EXCLUDED.trading_amount_nxt`,
                prevCloseKrx: sql`EXCLUDED.prev_close_krx`,
                prevCloseNxt: sql`EXCLUDED.prev_close_nxt`,
                changeValueKrx: sql`EXCLUDED.change_value_krx`,
                changeValueNxt: sql`EXCLUDED.change_value_nxt`,
            },
        });

    logger.info(`[upsertDailyCandles] ${stockCode} ${rows.length}개 일봉 저장 완료`);
}

// ============================================================
// 3. 분봉 저장
// ============================================================

/**
 * 특정 종목의 특정 거래일 분봉을 조회하여 DB에 저장합니다.
 * tradeDate 당일 분봉이 모두 나올 때까지 연속 조회하며,
 * tradeDate 이전 날짜 분봉이 감지되면 즉시 중단합니다.
 *
 * @param stockCode - 종목코드
 * @param tradeDate - 거래일 (예: "2024-10-21", DB date 형식)
 */
export async function upsertMinuteCandles(
    stockCode: string,
    tradeDate: string
): Promise<void> {
    logger.info(`[upsertMinuteCandles] ${stockCode} ${tradeDate} 분봉 조회 시작`);

    // 1. 해당 종목+날짜의 일봉 row를 DB에서 조회 (FK + prevClose 확보)
    const dailyRow = await db.query.dailyCandles.findFirst({
        where: and(
            eq(dailyCandles.stockCode, stockCode),
            eq(dailyCandles.tradeDate, tradeDate)
        ),
    });

    if (!dailyRow) {
        logger.warn(`[upsertMinuteCandles] ${stockCode} ${tradeDate} 일봉이 없음. 분봉 저장 건너뜀.`);
        return;
    }

    // 날짜를 API용 "YYYYMMDD" 포맷으로 변환
    const apiDate = tradeDate.replace(/-/g, "");

    // 2. tradeDate 당일 분봉 전체 수집 (연속 조회 포함)
    const rawMinutes = await fetchMinuteCandlesForDate(stockCode, apiDate);

    if (rawMinutes.length === 0) {
        logger.warn(`[upsertMinuteCandles] ${stockCode} ${tradeDate} 분봉 데이터 없음`);
        return;
    }

    logger.info(`[upsertMinuteCandles] ${rawMinutes.length}개 분봉 수집 완료`);

    // 3. 정규화
    const rows = rawMinutes.map((candle) =>
        normalizeMinuteCandle(
            candle,
            dailyRow.id,
            dailyRow.prevCloseKrx?.toString() ?? null,
            dailyRow.prevCloseNxt?.toString() ?? null
        )
    );

    // 4. INSERT OR IGNORE (같은 시간대 데이터 중복 방지)
    await db
        .insert(minuteCandles)
        .values(rows)
        .onConflictDoNothing();

    logger.info(`[upsertMinuteCandles] ${stockCode} ${tradeDate} ${rows.length}개 분봉 저장 완료`);
}
