// 보드 주목(델타) 신호 + 주도주 판정 — market-eye src/shared/signals.ts 이식(순수). 외부 import 0.
// 복기(분봉)라 30초 창은 불가 → 1분 델타만. 임계는 market-eye 값 그대로.

// ── 주도주(요약 임계) ─────────────────────────────────────────
// 시총 구간별 "이 등락률 이하면 요약(주도주 아님)". minCap 큰 순 첫 매칭. 단위: 억원 / %.
export const SUMMARIZE_TIERS: { minCapEok: number; maxRate: number }[] = [
    { minCapEok: 50_000, maxRate: 3 }, // 시총 5조 이상 → 3% 초과라야 주도주
    { minCapEok: 0, maxRate: 5 }, // 5조 미만 → 5% 초과
];

/** 시총(억원) 기준 요약 임계 등락률. */
export function summarizeMaxRate(marketCapEok: number): number {
    for (const t of SUMMARIZE_TIERS) if (marketCapEok >= t.minCapEok) return t.maxRate;
    return SUMMARIZE_TIERS[SUMMARIZE_TIERS.length - 1].maxRate;
}

/** 주도주 = 등락률이 시총별 요약 임계 초과. marketCapEok 미상(null)이면 5% 기준. */
export function isMover(marketCapEok: number | null, changeRate: number): boolean {
    return changeRate > summarizeMaxRate(marketCapEok ?? 0);
}

// ── 1분 델타 신호 ─────────────────────────────────────────────
// market-eye DELTA_RULES 의 1분 규칙: 등락률 AND 거래대금 동시 충족. 30초 규칙은 분봉상 제외.
/** 등락률 증가 임계(%p). */
export const SIGNAL_RATE_MIN = 0.6;
/** 거래대금 증가 임계(원) = 60억. market-eye 6000백만원. */
export const SIGNAL_TV_MIN_KRW = 6_000_000_000;

export interface DeltaHit {
    label: string;
    rateDelta: number; // %p
    tvDelta: number; // 원(최근 1분 거래대금)
}

/**
 * 1분 델타가 신호 임계를 넘으면 hit, 아니면 null.
 * rateDelta = 등락률(t) − 등락률(t−1분), tvDelta = 누적거래대금(t) − 누적거래대금(t−1분).
 */
export function evaluateSignal(rateDelta: number, tvDeltaKrw: number): DeltaHit | null {
    if (rateDelta >= SIGNAL_RATE_MIN && tvDeltaKrw >= SIGNAL_TV_MIN_KRW) {
        return { label: "1분", rateDelta, tvDelta: tvDeltaKrw };
    }
    return null;
}
