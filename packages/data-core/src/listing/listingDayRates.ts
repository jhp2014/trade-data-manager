import type { MinuteCandle } from "../schema/market";

/**
 * 신규상장 첫날(상장일) 보정 공용 로직.
 *
 * 배경: 상장일은 "전일"이 없어 전일종가(prevClose)가 null → 적재 단계에서
 * 등락률(open_rate_* ~ close_rate_*) 컬럼이 전부 null 로 저장된다.
 * 이 상태로는 분봉 차트(% 기반)·피처가 표현되지 않거나 0 으로 왜곡된다.
 *
 * 정책: market 테이블 원본은 그대로 두고(raw 보존), 차트/피처 계산 직전에
 * **메모리 상에서만** 당일 첫 분봉 시가를 기준으로 등락률을 채운다.
 * (상장일엔 KRX/NXT 구분이 의미 없으므로 두 계열을 동일한 시가 기준으로 채운다)
 */

/** (regDay, tradeDate) 가 같은 거래일이면 그 거래일이 상장일이다. */
export function isListingDay(regDay: string | null | undefined, tradeDate: string): boolean {
    return regDay != null && regDay === tradeDate;
}

/** (price - base) / base * 100 을 numeric(8,4) 형식 문자열로. base 가 유효하지 않으면 null. */
function rateFromBase(price: string, base: number): string | null {
    const p = Number(price);
    if (!Number.isFinite(p)) return null;
    return (((p - base) / base) * 100).toFixed(4);
}

/**
 * 상장일 분봉 배열의 null 등락률을 "당일 첫 분봉 open" 기준 %로 채운 새 배열을 반환한다.
 * - 입력 배열은 시간 오름차순 정렬 가정(첫 원소 = 당일 첫 분봉).
 * - 이미 값이 있는 컬럼은 건드리지 않는다(?? 로 null 만 채움 → 멱등·방어적).
 * - 첫 분봉 시가가 0/비정상이면 그대로 반환(계산 불가).
 * - market 테이블을 변경하지 않는다(새 객체 반환).
 */
export function fillListingDayRates(candles: MinuteCandle[]): MinuteCandle[] {
    if (candles.length === 0) return candles;

    const base = Number(candles[0].open);
    if (!Number.isFinite(base) || base <= 0) return candles;

    return candles.map((c) => {
        const openRate = rateFromBase(c.open, base);
        const highRate = rateFromBase(c.high, base);
        const lowRate = rateFromBase(c.low, base);
        const closeRate = rateFromBase(c.close, base);
        return {
            ...c,
            openRateKrx: c.openRateKrx ?? openRate,
            highRateKrx: c.highRateKrx ?? highRate,
            lowRateKrx: c.lowRateKrx ?? lowRate,
            closeRateKrx: c.closeRateKrx ?? closeRate,
            openRateNxt: c.openRateNxt ?? openRate,
            highRateNxt: c.highRateNxt ?? highRate,
            lowRateNxt: c.lowRateNxt ?? lowRate,
            closeRateNxt: c.closeRateNxt ?? closeRate,
        };
    });
}
