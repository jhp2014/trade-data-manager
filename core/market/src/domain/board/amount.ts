// 분봉 거래대금 구간(억) — 서버 스냅샷 카운트·차트 마커·필터가 공유하는 단일 진실원본.
// 7구간: [30,40) [40,50) [50,70) [70,100) [100,150) [150,200) [200,∞). 외부 import 0.
// ⚠ 이 파일의 임계·카운팅정책은 테마보드 파생(bucketCounts)에 반영된다 — 그건 apps/api 의 in-memory
//    캐시(themeStatsCache)라 서버 재시작(재배포)하면 자동 반영된다(파일 삭제 불필요).

/** 각 구간의 하한(억). 인덱스 i 구간 = [AMOUNT_BUCKETS_EOK[i], 다음하한). 마지막은 [200,∞). */
export const AMOUNT_BUCKETS_EOK = [30, 40, 50, 70, 100, 150, 200] as const;
export const AMOUNT_BUCKET_COUNT = AMOUNT_BUCKETS_EOK.length;

/** 거래대금(원) → 구간 인덱스(0..6). 30억 미만이면 -1(구간 없음). */
export function amountBucketIndex(amountKrw: number): number {
    const eok = amountKrw / 1e8;
    if (eok < AMOUNT_BUCKETS_EOK[0]) return -1;
    let idx = 0;
    for (let i = 0; i < AMOUNT_BUCKETS_EOK.length; i++) if (eok >= AMOUNT_BUCKETS_EOK[i]) idx = i;
    return idx;
}

// ── 거래대금 카운팅 정책 ─────────────────────────────────────────────
// "어떤 분봉을 구간 카운트(bucketCounts)에 넣을지"를 한 곳에 격리한다. bucketCounts 는 in-memory 이슈
// 캐시라 값 바꿔도 서버 재시작하면 자동 반영. 시간 창·음봉 규칙을 모두 이 정책이 소유한다.

export interface CountingPolicy {
    /** 카운트 시간 창(KST, "HH:MM"). 밖은 제외 — 15:30 종가단일가·NXT 오후 시간외 배제. */
    window: { start: string; end: string };
    /** 꼬리 없는 음봉 제외 — 종가<시가 & 윗꼬리(고가-시가)/시가 ≤ maxUpperWickPct(%)면 카운트 제외. */
    excludeBearishNoWick: { enabled: boolean; maxUpperWickPct: number };
}

/** 확정 정책(v1). 시간 08:00~15:20, 꼬리 없는 음봉(윗꼬리 ≤1%) 제외. 실험 시 여기만 갈아끼움. */
export const DEFAULT_COUNTING_POLICY: CountingPolicy = {
    window: { start: "08:00", end: "15:20" },
    excludeBearishNoWick: { enabled: true, maxUpperWickPct: 1.0 },
};

/** "HH:MM[:SS]" → 자정 이후 분(정수). */
function minuteOfDay(time: string): number {
    const [h, m] = time.split(":");
    return Number(h) * 60 + Number(m);
}

/**
 * 이 분봉을 거래대금 구간 카운트에 포함할까? ① 시간 창 안 ② 꼬리 없는 음봉 아님.
 * 가격은 원 단가(정수) — 무손실 계약과 무관한 비교/비율이라 Number 로 판정한다.
 */
export function shouldCountMinute(
    m: { time: string; open: number; high: number; low: number; close: number },
    policy: CountingPolicy = DEFAULT_COUNTING_POLICY,
): boolean {
    const mod = minuteOfDay(m.time);
    if (mod < minuteOfDay(policy.window.start) || mod > minuteOfDay(policy.window.end)) return false;
    const ex = policy.excludeBearishNoWick;
    if (ex.enabled && m.close < m.open && m.open > 0) {
        const upperWickPct = ((m.high - m.open) / m.open) * 100;
        if (upperWickPct <= ex.maxUpperWickPct) return false; // 열자마자 눌린 순수 매도 분봉
    }
    return true;
}
