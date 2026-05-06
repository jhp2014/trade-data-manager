// services/assemblers/candleAssembler.ts
import { DailyCandleInsert, MinuteCandleInsert } from "@trade-data-manager/data-core";
import { KiwoomDailyCandle, KiwoomMinuteCandle } from "../../clients/types.js";
import { toDailyCandleInsert, toMinuteCandleInsert } from "../mappers/marketDataMapper.js";
import { computeAccumulatedAmounts } from "../mappers/utils/priceCalculator.js";

/**
 * Candle Assemblers
 *
 *  Kiwoom 응답(배열) ──► [필터/정렬/누적] ──► Mapper(row x N) ──► DB Insert 배열
 *
 * Mapper와의 차이:
 *  - Mapper: row 1개 변환 (순수)
 *  - Assembler: 배열 단위 도메인 규칙 적용 (정렬, 전일종가 계산, 누적합 등)
 */

// ──────────────────────────────────────────────
// [1] 일봉 (KRX + NXT 결합)
//
//   Kiwoom API (KRX) ─┐
//   Kiwoom API (NXT) ─┼──► Assembler ──► Mapper (row x N) ──► Repository
//   stocks.regDay ────┘
// ──────────────────────────────────────────────

/**
 * KRX/NXT 일봉 배열을 DB Insert 형태로 조립합니다.
 *
 * 입력 가정:
 *  - krxCandles, nxtCandles 모두 최신순 정렬 (index 0이 가장 최근)
 *  - 두 배열의 i번째는 같은 거래일을 가리킴
 *
 * 도메인 규칙:
 *  - 가장 오래된 캔들이 상장일과 같다면 전일 종가는 null
 *  - 그 외 캔들은 i+1번째 캔들의 종가를 전일 종가로 사용
 *  - 상장일이 아닌데 마지막 캔들에 도달한 경우, 전일 종가를 알 수 없으므로 제외
 */
export function assembleDailyCandles(params: {
    stockCode: string;
    regDay: string | null;            // 'YYYYMMDD'
    krxCandles: KiwoomDailyCandle[];
    nxtCandles: KiwoomDailyCandle[];
}): DailyCandleInsert[] {
    const { stockCode, regDay, krxCandles, nxtCandles } = params;

    const count = Math.min(krxCandles.length, nxtCandles.length);
    if (count === 0) return [];

    const rows: DailyCandleInsert[] = [];

    // 1) 일반 캔들: 전일 종가 = i+1번째 캔들의 종가
    for (let i = 0; i < count - 1; i++) {
        rows.push(toDailyCandleInsert({
            stockCode,
            krx: krxCandles[i],
            nxt: nxtCandles[i],
            previousCloseKrx: krxCandles[i + 1].cur_prc,
            previousCloseNxt: nxtCandles[i + 1].cur_prc,
        }));
    }

    // 2) 가장 오래된 캔들: 상장일이면 전일 종가 없이 포함
    const oldestIndex = count - 1;
    const oldestKrx = krxCandles[oldestIndex];
    const oldestNxt = nxtCandles[oldestIndex];
    const isListingDayCandle = regDay !== null && oldestKrx.dt === regDay;

    if (isListingDayCandle) {
        rows.push(toDailyCandleInsert({
            stockCode,
            krx: oldestKrx,
            nxt: oldestNxt,
            previousCloseKrx: null,
            previousCloseNxt: null,
        }));
    }

    return rows;
}

// ──────────────────────────────────────────────
// [2] 분봉
//
//   Kiwoom API ──► [날짜 필터] ──► [시간 정렬] ──► Mapper(row x N) ──► [누적합 주입] ──► rows
// ──────────────────────────────────────────────

/**
 * 분봉 배열을 DB Insert 형태로 조립합니다.
 *
 * 책임:
 *  1) 응답에 섞여 있을 수 있는 다른 날짜의 분봉 제외
 *  2) 시간 오름차순 정렬 (누적합/저장 순서를 일관되게)
 *  3) 누적거래대금 계산 후 row에 주입
 */
export function assembleMinuteCandles(params: {
    candles: KiwoomMinuteCandle[];
    dailyCandleId: bigint;
    stockCode: string;
    tradeDate: string;              // 'YYYY-MM-DD'
    previousCloseKrx: string | null;
    previousCloseNxt: string | null;
}): MinuteCandleInsert[] {
    const {
        candles, dailyCandleId, stockCode, tradeDate,
        previousCloseKrx, previousCloseNxt,
    } = params;

    // 1) 해당 거래일의 분봉만 필터링
    const apiDate = tradeDate.replace(/-/g, "");
    const filtered = candles.filter((c) => c.cntr_tm.startsWith(apiDate));
    if (filtered.length === 0) return [];

    // 2) 시간 오름차순 정렬
    const sorted = [...filtered].sort((a, b) =>
        a.cntr_tm.localeCompare(b.cntr_tm)
    );

    // 3) Mapper로 row 단위 변환 (누적값 제외 상태)
    const drafts = sorted.map((candle) =>
        toMinuteCandleInsert({
            candle,
            dailyCandleId,
            stockCode,
            tradeDate,
            previousCloseKrx,
            previousCloseNxt,
        })
    );

    // 4) 누적거래대금 일괄 계산 후 주입
    const accumulated = computeAccumulatedAmounts(
        drafts.map((d) => d.tradingAmount as string)
    );

    return drafts.map((draft, i) => ({
        ...draft,
        accumulatedTradingAmount: accumulated[i],
    }));
}
