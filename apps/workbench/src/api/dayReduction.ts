// /day-reduction 조회 — 복기보드+이슈보드 합본 축약물(파일 캐시). 종목별 분당 시계열 + EOD 스칼라.
// 모든 %는 원주가 직전 거래일 종가 대비(서버 계산). 클라는 시점 스냅샷·창별 top-4 만 파생.

export interface ReducedStock {
    code: string;
    times: number[]; // unix seconds asc
    rate: number[]; // 등락률 %(분당 종가)
    high: number[]; // running 고가 %
    low: number[]; // running 저가 %
    open: number; // 당일 시가 %(스칼라)
    cumAmount: number[]; // 누적 거래대금(원)
    bucketCounts: number[]; // EOD 거래대금 구간 횟수(길이 7) — 이슈보드 hover
    trailingHighs: number[]; // 매 거래일 high%(index=daysAgo, 0=당일) — 창별 최고가
}

export interface DayReduction {
    date: string;
    version: string;
    stocks: ReducedStock[];
}

export async function fetchDayReduction(date: string): Promise<DayReduction> {
    const qs = new URLSearchParams({ date });
    const res = await fetch(`/api/day-reduction?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /day-reduction ${res.status}: ${body}`);
    }
    return res.json() as Promise<DayReduction>;
}
