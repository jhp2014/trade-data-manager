// services/mappers/marketDataMapper.ts
import { normalizeSignedNumber, toBigInt } from "./utils/kiwoomNumberParser.js";
import { toIsoDate, extractTimeFromTimestamp, toUnixTimestampKst } from "./utils/dateTimeParser.js";
import { computeChangeValue, computeChangeRate, computeMinuteTradingAmount } from "./utils/priceCalculator.js";
import { KiwoomKa10080Response, KiwoomKa10081Response, KiwoomKa10100Response } from "../../clients/types.js";
import { DailyCandleInsert, StockInsert } from "@trade-data-manager/data-core";
import { MinuteCandleRowDraft } from "../types.js";

type KiwoomDailyCandle = KiwoomKa10081Response["stk_dt_pole_chart_qry"][number];
type KiwoomMinuteCandle = KiwoomKa10080Response["stk_min_pole_chart_qry"][number];

/**
 * 키움 응답 → DB Insert 형태로 변환하는 순수 Mapper 함수들.
 *
 * 원칙
 *  - 외부 의존성 없음 (DB/API/로거 호출 금지)
 *  - row 1개 단위로만 변환 (배열 처리는 Assembler 책임)
 *  - 입력은 객체로 받아 인자 추가/변경에 안전
 *  - 스키마 타입에서 반환 타입을 추론하므로 schema drift에 강함
 */

// ──────────────────────────────────────────────
// [1] 종목 마스터
// ──────────────────────────────────────────────
export function toStockInsert(info: KiwoomKa10100Response): StockInsert {
    return {
        stockCode: info.code,
        stockName: info.name,
        marketName: info.marketName,
        isNxtAvailable: info.nxtEnable === "Y",
        regDay: toIsoDate(info.regDay),
    };
}

/**
 * [2] 일봉 (KRX + NXT 결합)
 *
 *  Kiwoom API (KRX) ─┐
 *  Kiwoom API (NXT) ─┼──► Assembler ──► Mapper (row x N) ──► Repository
 *  stocks.regDay ────┘
 */
export function toDailyCandleInsert(params: {
    stockCode: string;
    krx: KiwoomDailyCandle;
    nxt: KiwoomDailyCandle;
    previousCloseKrx: string | null;
    previousCloseNxt: string | null;
}): DailyCandleInsert {
    const { stockCode, krx, nxt, previousCloseKrx, previousCloseNxt } = params;

    return {
        tradeDate: toIsoDate(krx.dt),
        stockCode,

        // 가격 (KRX)
        openKrx: normalizeSignedNumber(krx.open_pric),
        highKrx: normalizeSignedNumber(krx.high_pric),
        lowKrx: normalizeSignedNumber(krx.low_pric),
        closeKrx: normalizeSignedNumber(krx.cur_prc),

        // 가격 (NXT)
        openNxt: normalizeSignedNumber(nxt.open_pric),
        highNxt: normalizeSignedNumber(nxt.high_pric),
        lowNxt: normalizeSignedNumber(nxt.low_pric),
        closeNxt: normalizeSignedNumber(nxt.cur_prc),

        // 거래량 / 거래대금
        tradingVolumeKrx: toBigInt(krx.trde_qty),
        tradingAmountKrx: normalizeSignedNumber(krx.trde_prica),
        tradingVolumeNxt: toBigInt(nxt.trde_qty),
        tradingAmountNxt: normalizeSignedNumber(nxt.trde_prica),

        // 전일 종가
        prevCloseKrx: previousCloseKrx,
        prevCloseNxt: previousCloseNxt,

        // 전일 대비 변동값
        changeValueKrx: computeChangeValue(krx.cur_prc, previousCloseKrx),
        changeValueNxt: computeChangeValue(nxt.cur_prc, previousCloseNxt),

        // 종목 기본정보는 별도 동기화 책임
        marketCap: null,
        listedShares: null,
        floatingShares: null,
    };
}

/**
 * [3] 분봉
 *
 *  Kiwoom API ──► Assembler ──► Mapper (row x N) ──► Repository
 */
export function toMinuteCandleInsert(params: {
    candle: KiwoomMinuteCandle;
    dailyCandleId: bigint;
    stockCode: string;
    tradeDate: string;
    previousCloseKrx: string | null;
    previousCloseNxt: string | null;
}): MinuteCandleRowDraft {
    const {
        candle, dailyCandleId, stockCode, tradeDate,
        previousCloseKrx, previousCloseNxt,
    } = params;

    const open = normalizeSignedNumber(candle.open_pric);
    const high = normalizeSignedNumber(candle.high_pric);
    const low = normalizeSignedNumber(candle.low_pric);
    const close = normalizeSignedNumber(candle.cur_prc);
    const volume = normalizeSignedNumber(candle.trde_qty);

    return {
        dailyCandleId,
        tradeDate,
        stockCode,

        tradeTime: extractTimeFromTimestamp(candle.cntr_tm),
        unixTimestamp: toUnixTimestampKst(candle.cntr_tm),

        open, high, low, close,

        tradingVolume: BigInt(volume),
        tradingAmount: computeMinuteTradingAmount({ open, high, low, close, volume }),

        // 등락률 (KRX)
        openRateKrx: computeChangeRate(open, previousCloseKrx),
        highRateKrx: computeChangeRate(high, previousCloseKrx),
        lowRateKrx: computeChangeRate(low, previousCloseKrx),
        closeRateKrx: computeChangeRate(close, previousCloseKrx),

        // 등락률 (NXT)
        openRateNxt: computeChangeRate(open, previousCloseNxt),
        highRateNxt: computeChangeRate(high, previousCloseNxt),
        lowRateNxt: computeChangeRate(low, previousCloseNxt),
        closeRateNxt: computeChangeRate(close, previousCloseNxt),
    };
}
