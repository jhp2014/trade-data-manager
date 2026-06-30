// core/market/domain/price — 순수 가격 계산(외부 import 0). 버그 핵심부, DB 없이 단위테스트.
//
// 전제: 입력은 이미 정규화된 숫자 문자열(키움의 "+"/"-" 시각표시 prefix 제거 완료).
// 그 정규화는 벤더 특화라 어댑터(infra/broker)의 매핑 책임이며 도메인은 깨끗한 값만 받는다.
// 가격은 음수가 아니고, 등락값만 음수가 될 수 있다. 정밀도 유지를 위해 BigInt 사용.

/**
 * 전일 대비 변동값 (현재가 - 전일종가). 전일종가가 없으면 null.
 */
export function computeChangeValue(
    currentPrice: string,
    previousClose: string | null,
): string | null {
    if (previousClose === null) return null;
    return (BigInt(currentPrice) - BigInt(previousClose)).toString();
}

/**
 * 등락률(%). DB 스키마 numeric(8,4) 계약에 맞춰 소수 4자리 문자열로 반환.
 * 기준가가 없거나 0이면 null. 가격 범위가 53비트 안이라 Number 사용이 안전하다.
 */
export function computeChangeRate(
    price: string,
    basePrice: string | null,
): string | null {
    if (basePrice === null) return null;
    const base = Number(basePrice);
    if (base === 0) return null;
    return (((Number(price) - base) / base) * 100).toFixed(4);
}

/**
 * 분봉 거래대금 = (시가+고가+저가+종가)/4 × 거래량.
 * 분봉 소스가 거래대금을 안 주거나(키움) 다른 정의로 주므로(KIS acml_tr_pbmn) OHLC평균×량으로 통일.
 * 평균가의 소수점은 정수 나눗셈으로 내림 처리한다.
 */
export function computeMinuteTradingAmount(bar: {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}): string {
    const sum =
        BigInt(bar.open) + BigInt(bar.high) + BigInt(bar.low) + BigInt(bar.close);
    const averagePrice = sum / 4n; // 정수 나눗셈 = 내림
    return (averagePrice * BigInt(bar.volume)).toString();
}

/**
 * 시간 오름차순 거래대금 배열의 누적합. BigInt 기반 무손실.
 * 분봉 거래대금이 정수라 손실이 없지만, 방어적으로 정수부만 누적한다(DB precision 18, scale 0).
 *
 * @param amounts 시간 오름차순으로 정렬된 거래대금 문자열 배열
 * @returns 같은 길이의 누적 거래대금 문자열 배열
 */
export function computeAccumulatedAmounts(amounts: string[]): string[] {
    let acc = 0n;
    return amounts.map((amt) => {
        acc += BigInt(amt.split(".")[0]);
        return acc.toString();
    });
}
