import { normalizeSignedNumber } from "./kiwoomNumberParser";

/**
 * 두 가격의 차이 (현재가 - 전일종가). 정밀도 유지를 위해 BigInt 사용.
 * 입력 중 하나라도 없으면 null.
 */
export function computeChangeValue(
    currentPrice: string,
    previousClose: string | null,
): string | null {
    if (previousClose === null) return null;
    const cur = BigInt(normalizeSignedNumber(currentPrice));
    const prev = BigInt(normalizeSignedNumber(previousClose));
    return (cur - prev).toString();
}

/**
 * 등락률(%) 계산. 스키마 numeric(8, 4) 에 맞춰 소수 4자리 문자열로 반환.
 * 기준가가 없거나 0이면 null.
 *
 * 가격 범위가 53비트 안에 충분히 들어오므로 Number 사용이 안전합니다.
 */
export function computeChangeRate(
    price: string,
    basePrice: string | null,
): string | null {
    if (basePrice === null) return null;
    const baseNum = Number(normalizeSignedNumber(basePrice));
    if (baseNum === 0) return null;
    const priceNum = Number(normalizeSignedNumber(price));
    return (((priceNum - baseNum) / baseNum) * 100).toFixed(4);
}


/**
 * 분봉 거래대금 = (시가 + 고가 + 저가 + 종가) / 4 × 거래량
 *
 * 키움 분봉 API가 거래대금을 내려주지 않기 때문에 OHLC 평균가 × 거래량으로 근사합니다.
 * 평균가에서 발생하는 소수점은 정수로 내림 처리합니다.
 */
export function computeMinuteTradingAmount(params: {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}): string {
    const { open, high, low, close, volume } = params;

    const sum =
        BigInt(normalizeSignedNumber(open)) +
        BigInt(normalizeSignedNumber(high)) +
        BigInt(normalizeSignedNumber(low)) +
        BigInt(normalizeSignedNumber(close));

    const averagePrice = sum / 4n;     // 정수 나눗셈으로 내림
    const tradingAmount = averagePrice * BigInt(normalizeSignedNumber(volume));

    return tradingAmount.toString();
}

/**
 * 시간순으로 정렬된 거래대금 배열에 대해 누적합을 계산합니다.
 * BigInt 기반으로 정확도를 보장합니다.
 *
 * @param amounts 시간 오름차순으로 정렬된 거래대금 문자열 배열
 * @returns 같은 길이의 누적 거래대금 문자열 배열
 */
export function computeAccumulatedAmounts(amounts: string[]): string[] {
    let acc = 0n;
    return amounts.map((amt) => {
        // 정수 부분만 누적 (DB precision: 18, scale: 0)
        acc += BigInt(amt.split(".")[0]);
        return acc.toString();
    });
}