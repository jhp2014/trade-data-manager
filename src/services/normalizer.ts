import type {
    KiwoomKa10080Response,
    KiwoomKa10081Response,
    KiwoomKa10100Response,
    KiwoomKa10001Response,
} from "@/clients/kiwoomClient";
import { dailyCandles, minuteCandles, stocks } from "@/db/schema/market";


// 1. Drizzle 타입 추론을 통한 Insert 타입 정의 (Type-First)
export type DailyCandleInsert = typeof dailyCandles.$inferInsert;
export type StockInsert = typeof stocks.$inferInsert;
export type MinuteCandleInsert = typeof minuteCandles.$inferInsert;

type RawDailyCandle = KiwoomKa10081Response["stk_dt_pole_chart_qry"][number];
type RawMinuteCandle = KiwoomKa10080Response["stk_min_pole_chart_qry"][number];


/**
 * 키움 API 숫자 문자열의 부호(+, -)를 제거하고 절대값 문자열을 반환
 * 예) "-78800" → "78800",  "+600" → "600",  "70100" → "70100"
 */
export function parseSigned(str: string): string {
    if (!str) return "0";
    return String(Math.abs(Number(str)));
}

/**
 * (price - prevClose) / prevClose * 100 을 계산하여 소수점 4자리 문자열로 반환
 * 예) price="79400", prevClose="78800" → "0.7614"
 */
export function calcRate(price: string, prevClose: string): string | null {
    const p = Number(parseSigned(price));
    const pc = Number(prevClose);
    if (!pc || !p) return null;
    return ((p - pc) / pc * 100).toFixed(4);
}

/**
 * "20250908" → "2025-09-08" 포맷 변환
 */
function formatDate(raw: string): string {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/**
 * "20250917132000" → "13:20:00" 포맷 변환 (체결시간)
 */
function formatTime(raw: string): string {
    return `${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
}

// ============================================================
// 2. stocks 테이블 Normalizer
// ============================================================


/**
 * ka10100(종목정보조회) + ka10001(기본정보) 응답을 stocks INSERT용 객체로 변환
 */
export function normalizeStockInfo(
    ka10100: KiwoomKa10100Response,
    ka10001?: KiwoomKa10001Response
): StockInsert {
    // regDay: "20090803" → "2009-08-03" (DB date 형식)
    const rd = ka10100.regDay;
    const regDay = rd ? `${rd.slice(0, 4)}-${rd.slice(4, 6)}-${rd.slice(6, 8)}` : null;

    return {
        stockCode: ka10100.code,
        stockName: ka10100.name,
        marketName: ka10100.marketName || null,
        isNxtAvailable: ka10100.nxtEnable === "Y",
        regDay,
    };
}

// ============================================================
// 3. dailyCandles 테이블 Normalizer
// ============================================================

/**
 * ka10081 응답의 개별 캔들(KRX + NXT)을 dailyCandles 한 row로 변환
 *
 * @param krxCandle    - KRX 일봉 캔들 (ka10081 응답의 단일 row)
 * @param nxtCandle    - NXT 일봉 캔들 (ka10081 응답의 단일 row)
 * @param stockCode    - 종목코드
 * @param prevCloseKrx - KRX 전일 종가 (첫 번째 row이거나 알 수 없으면 null)
 * @param prevCloseNxt - NXT 전일 종가 (첫 번째 row이거나 알 수 없으면 null)
 */
export function normalizeDailyCandle(
    krxCandle: RawDailyCandle,
    nxtCandle: RawDailyCandle,
    stockCode: string,
    prevCloseKrx: string | null = null,
    prevCloseNxt: string | null = null
): DailyCandleInsert {
    const closeKrx = parseSigned(krxCandle.cur_prc);
    const closeNxt = parseSigned(nxtCandle.cur_prc);

    const changeValueKrx = prevCloseKrx !== null
        ? String(Number(closeKrx) - Number(prevCloseKrx))
        : null;
    const changeValueNxt = prevCloseNxt !== null
        ? String(Number(closeNxt) - Number(prevCloseNxt))
        : null;

    return {
        tradeDate: formatDate(krxCandle.dt),
        stockCode,
        // KRX
        openKrx: parseSigned(krxCandle.open_pric),
        highKrx: parseSigned(krxCandle.high_pric),
        lowKrx: parseSigned(krxCandle.low_pric),
        closeKrx,
        tradingVolumeKrx: BigInt(krxCandle.trde_qty),
        tradingAmountKrx: parseSigned(krxCandle.trde_prica),
        // NXT
        openNxt: parseSigned(nxtCandle.open_pric),
        highNxt: parseSigned(nxtCandle.high_pric),
        lowNxt: parseSigned(nxtCandle.low_pric),
        closeNxt,
        tradingVolumeNxt: BigInt(nxtCandle.trde_qty),
        tradingAmountNxt: parseSigned(nxtCandle.trde_prica),
        // 전일 종가 / 변동값
        prevCloseKrx,
        prevCloseNxt,
        changeValueKrx,
        changeValueNxt,
        // 종목 기본 정보 (배치에서 별도로 채우는 경우 null로 남겨둠)
        marketCap: null,
        listedShares: null,
        floatingShares: null,
    };
}

// ============================================================
// 4. minuteCandles 테이블 Normalizer
// ============================================================

/**
 * ka10080 응답의 개별 분봉을 minuteCandles INSERT용 객체로 변환
 *
 * @param candle        - ka10080 응답의 단일 분봉 row
 * @param dailyCandleId - 연결된 일봉의 PK (BigInt)
 * @param prevCloseKrx  - KRX 전일 종가 (dailyCandles.prevCloseKrx)
 * @param prevCloseNxt  - NXT 전일 종가 (dailyCandles.prevCloseNxt)
 */
export function normalizeMinuteCandle(
    candle: RawMinuteCandle,
    dailyCandleId: bigint,
    prevCloseKrx: string | null,
    prevCloseNxt: string | null
): MinuteCandleInsert {
    const open = parseSigned(candle.open_pric);
    const high = parseSigned(candle.high_pric);
    const low = parseSigned(candle.low_pric);
    const close = parseSigned(candle.cur_prc);

    return {
        dailyCandleId,
        tradeTime: formatTime(candle.cntr_tm),
        open,
        high,
        low,
        close,
        tradingVolume: BigInt(candle.trde_qty),
        // 거래대금 = (O+H+L+C)/4 × 거래량 (VWAP 근사치, 분봉에는 실거래대금 필드 없음)
        tradingAmount: String(
            Math.round((Number(open) + Number(high) + Number(low) + Number(close)) / 4 * Number(candle.trde_qty))
        ),

        // KRX 등락률
        openRateKrx: prevCloseKrx ? calcRate(open, prevCloseKrx) : null,
        highRateKrx: prevCloseKrx ? calcRate(high, prevCloseKrx) : null,
        lowRateKrx: prevCloseKrx ? calcRate(low, prevCloseKrx) : null,
        closeRateKrx: prevCloseKrx ? calcRate(close, prevCloseKrx) : null,

        // NXT 등락률
        openRateNxt: prevCloseNxt ? calcRate(open, prevCloseNxt) : null,
        highRateNxt: prevCloseNxt ? calcRate(high, prevCloseNxt) : null,
        lowRateNxt: prevCloseNxt ? calcRate(low, prevCloseNxt) : null,
        closeRateNxt: prevCloseNxt ? calcRate(close, prevCloseNxt) : null,
    };
}
