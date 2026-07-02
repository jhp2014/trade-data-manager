// 실시간 복기 보드 유니버스 선정 — 순수 순위 규칙(파라미터화). 외부 import 0.
// "거래대금 상위 amountN ∪ 등락률 상위 rateN" = 그 시점 주목 종목 집합(~100). 임계는 호출자가 조절.

/** 순위 선정에 필요한 최소 형태. */
export interface HotRankable {
    code: string;
    changeRate: number;
    amount: number; // 거래대금(시점 누적 등, 순위용 스칼라)
}

/**
 * 거래대금 desc 상위 amountN ∪ 등락률 desc 상위 rateN 의 코드 집합.
 * 두 랭킹의 합집합이라 결과는 대략 amountN..amountN+rateN 사이(겹침만큼 감소).
 */
export function selectHotUniverse<T extends HotRankable>(
    stocks: readonly T[],
    amountN: number,
    rateN: number,
): Set<string> {
    const byAmount = [...stocks].sort((a, b) => b.amount - a.amount).slice(0, amountN);
    const byRate = [...stocks].sort((a, b) => b.changeRate - a.changeRate).slice(0, rateN);
    const hot = new Set<string>();
    for (const s of byAmount) hot.add(s.code);
    for (const s of byRate) hot.add(s.code);
    return hot;
}
