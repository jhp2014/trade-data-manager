// 분봉 거래대금 구간(억) — 서버 스냅샷 카운트·차트 마커·필터가 공유하는 단일 진실원본.
// 7구간: [30,40) [40,50) [50,70) [70,100) [100,150) [150,200) [200,∞). 외부 import 0.
// ⚠ bucketCounts 는 복기 파일 파생값(MinuteDerived)에서 **요청 때 재계산**된다(apps/api DerivedStore.themeBoard).
//    그래서 이 정책(시간창·음봉/꼬리·임계)을 바꾸면 파일 재빌드 없이 **다음 요청에 자동 반영**된다(캐시 없음).
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
// "어떤 분봉을 구간 카운트(bucketCounts)에 넣을지"를 한 곳에 격리한다. 시간 창·음봉 규칙을 정책이 소유.
// 파생 %-표현(원주가 base 대비 %)만으로 판정한다 — 음봉·꼬리는 비율/비교라 base 없이 성립.

export interface CountingPolicy {
    /** 카운트 시간 창(KST, "HH:MM"). 밖은 제외 — 15:30 종가단일가·NXT 오후 시간외 배제. */
    window: { start: string; end: string };
    /** 꼬리 없는 음봉 제외 — 종가%<시가% & 윗꼬리(고가%−시가%, base 대비 %p) ≤ maxUpperWickPct 면 카운트 제외. */
    excludeBearishNoWick: { enabled: boolean; maxUpperWickPct: number };
}

/** 확정 정책(v1). 시간 08:00~15:20, 꼬리 없는 음봉(윗꼬리 ≤1%p) 제외. 실험 시 여기만 갈아끼움. */
export const DEFAULT_COUNTING_POLICY: CountingPolicy = {
    window: { start: "08:00", end: "15:20" },
    excludeBearishNoWick: { enabled: true, maxUpperWickPct: 1.0 },
};

/** "HH:MM[:SS]" → 자정 이후 분(정수). */
function minuteOfDayOf(time: string): number {
    const [h, m] = time.split(":");
    return Number(h) * 60 + Number(m);
}

/** 파생 %-표현의 분봉 한 개(카운팅 판정 입력). 가격은 원주가 base 대비 %, 거래대금만 원. */
export interface DerivedMinute {
    minuteOfDay: number; // KST 자정 이후 분
    openPct: number;
    highPct: number;
    closePct: number;
    amountWon: number;
}

/**
 * 파생 %-표현에서 거래대금 구간 카운트를 재계산한다. 정책(시간창·꼬리없는음봉) 적용.
 * ① 시간 창 안 ② 꼬리 없는 음봉(종가%<시가% & 고가%−시가% ≤ 임계) 아님 인 분봉만, 거래대금 구간에 +1.
 */
export function countAmountBuckets(minutes: DerivedMinute[], policy: CountingPolicy = DEFAULT_COUNTING_POLICY): number[] {
    const startMod = minuteOfDayOf(policy.window.start);
    const endMod = minuteOfDayOf(policy.window.end);
    const ex = policy.excludeBearishNoWick;
    const counts = new Array<number>(AMOUNT_BUCKET_COUNT).fill(0);
    for (const m of minutes) {
        if (m.minuteOfDay < startMod || m.minuteOfDay > endMod) continue;
        if (ex.enabled && m.closePct < m.openPct && m.highPct - m.openPct <= ex.maxUpperWickPct) continue; // 열자마자 눌린 순수 매도 분봉
        const idx = amountBucketIndex(m.amountWon);
        if (idx >= 0) counts[idx] += 1;
    }
    return counts;
}
