// 순수 계산 — tdm-work core/market/domain(price.ts · kst.ts)에서 차트가 쓰는 것만 옮겨 왔다.
// 가격은 무손실 string 입력, 정밀도가 필요한 곳은 BigInt.

/** 등락률(%) — 소수 4자리 문자열. 기준가가 없거나 0이면 null. */
export function computeChangeRate(price: string, basePrice: string | null): string | null {
    if (basePrice === null) return null;
    const base = Number(basePrice);
    if (base === 0) return null;
    return (((Number(price) - base) / base) * 100).toFixed(4);
}

/** 분봉 거래대금 = (시가+고가+저가+종가)/4(내림) × 거래량. */
export function computeMinuteTradingAmount(bar: { open: string; high: string; low: string; close: string; volume: string }): string {
    const sum = BigInt(bar.open) + BigInt(bar.high) + BigInt(bar.low) + BigInt(bar.close);
    return ((sum / 4n) * BigInt(bar.volume)).toString();
}

/** 시간 오름차순 거래대금의 누적합(정수부만). */
export function computeAccumulatedAmounts(amounts: string[]): string[] {
    let acc = 0n;
    return amounts.map((amt) => {
        acc += BigInt(amt.split(".")[0]);
        return acc.toString();
    });
}

/** KST date(YYYY-MM-DD) + time(HH:MM:SS) → unix seconds. */
export function kstToUnix(date: string, time: string): number {
    return Math.floor(Date.parse(`${date}T${time}+09:00`) / 1000);
}

/** 오늘(KST) YYYY-MM-DD. */
export function kstToday(): string {
    return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}
