// 기간별 최고가 파생 — 원자재(매 거래일 high% 배열)에서 창별 top-N 을 뽑는 순수 로직.
// 클라(워크벤치)가 import 해 20/40/60/80/100/120 거래일 창을 각각 계산한다. 외부 import 0.
//
// 원자재 = trailingHighs[](index=daysAgo, 0=당일), 값 = high%(기준일 D 의 전일종가 대비).
// 창(windowDays)은 배열 "앞부분 슬라이스"라 20창 ⊂ 40창 ⊂ … 로 포개진다 → 배열 하나로 모든 창 커버.
// 미리 top-N 을 저장하지 않는 이유: 그러면 창 밖 봉을 버려 작은 창을 복원할 수 없다.

/** 한 창의 상위 고가 한 건 — 며칠 전(거래일)·그때 high%(D 전일종가 대비). */
export interface WindowHigh {
    daysAgo: number;
    highPct: number;
}

/**
 * 최근 windowDays 거래일의 high% 상위 topN.
 * high% 내림차순, 동률이면 더 최근(daysAgo 작은) 우선. 배열이 windowDays 보다 짧으면(상장 초기) 있는 만큼.
 */
export function topHighsInWindow(
    highsPct: readonly number[],
    windowDays: number,
    topN: number,
): WindowHigh[] {
    const slice = highsPct
        .slice(0, windowDays)
        .map((highPct, daysAgo) => ({ daysAgo, highPct }));
    slice.sort((a, b) => b.highPct - a.highPct || a.daysAgo - b.daysAgo);
    return slice.slice(0, topN);
}

/**
 * 당일(index 0)이 windowDays 창 최고가의 tolerancePct% 이내(아래로)인가 — "신고가 근접" 판정.
 * 같은 base(%) 라 (창최고 − 당일) 이 곧 가격 갭. 당일이 최고면 갭 0 → true. 빈 배열이면 false.
 */
export function isNearWindowHigh(
    highsPct: readonly number[],
    windowDays: number,
    tolerancePct: number,
): boolean {
    if (highsPct.length === 0) return false;
    const today = highsPct[0];
    let max = -Infinity;
    for (let i = 0; i < Math.min(windowDays, highsPct.length); i++) {
        if (highsPct[i] > max) max = highsPct[i];
    }
    return max - today <= tolerancePct;
}
