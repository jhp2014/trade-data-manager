// core/market/domain/price — 순수 가격 계산(외부 import 0). 버그 핵심부, DB 없이 단위테스트.
//
// 전제: 입력은 이미 정규화된 숫자 문자열(키움의 "+"/"-" 시각표시 prefix 제거 완료).
// 그 정규화는 벤더 특화라 어댑터(infra/broker)의 매핑 책임이며 도메인은 깨끗한 값만 받는다.
// 가격은 음수가 아니고, 등락값만 음수가 될 수 있다. 정밀도 유지를 위해 BigInt 사용.

import type { DailyCandle } from "./model.js";

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

/** 1억(원). 거래대금 임계는 "억" 단위로 표현되므로 원 환산에 쓴다. */
const KRW_PER_EOK = 100_000_000n;

/**
 * 거래대금(원) 배열을 억 단위 임계별로 카운트한다 — "임계 t억 이상인 분봉이 몇 개인가".
 * 각 threshold(억)마다 독립 카운트(누적 아님): amount ≥ t억 이면 +1.
 * 무손실 정수 비교(BigInt) — 소수부는 방어적으로 버린다(거래대금은 정수라 통상 무영향).
 * 반환은 threshold(억) → count. 입력 thresholds 전부를 0으로 초기화해 키 누락이 없다.
 */
export function countByAmountThreshold(
    amountsKrw: string[],
    thresholdsEok: readonly number[],
): Record<number, number> {
    const counts: Record<number, number> = {};
    for (const t of thresholdsEok) counts[t] = 0;

    for (const amt of amountsKrw) {
        const krw = BigInt(amt.split(".")[0]);
        for (const t of thresholdsEok) {
            if (krw >= BigInt(t) * KRW_PER_EOK) counts[t] += 1;
        }
    }
    return counts;
}

/**
 * 분봉 등락률(%)의 기준가 — 요청일 *직전 거래일* 일봉의 시장별 종가.
 * 일봉 번들(date−2년…date)이 이미 이 값을 품고 있으므로 별도 조회 없이 여기서 파생한다.
 * "date 보다 작은 마지막 캔들"을 date 비교로 고른다(배열 위치 가정 X — 당일 일봉 미적재여도 안전).
 * 직전 캔들이 없으면(상장일 등) null → 소비자는 당일 첫 분봉 시가로 폴백한다.
 */
export function previousCloseFromDaily(
    daily: DailyCandle[],
    date: string,
): { krxClose: string; unClose: string } | null {
    let prev: DailyCandle | null = null;
    for (const c of daily) {
        if (c.date >= date) continue;
        if (prev === null || c.date > prev.date) prev = c;
    }
    if (prev === null) return null;
    return { krxClose: prev.krx.close, unClose: prev.un.close };
}
