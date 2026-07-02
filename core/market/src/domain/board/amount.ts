// 분봉 거래대금 구간(억) — 서버 스냅샷 카운트·차트 마커·필터가 공유하는 단일 진실원본.
// 7구간: [30,40) [40,50) [50,70) [70,100) [100,150) [150,200) [200,∞). 외부 import 0.

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
