// /day-board 조회 — 실시간 복기 보드용 lean 지표(종목별 분당 running). raw 아님(~1MB gzip).
// 클라가 통째로 들고 시점별 랭킹·top-N·스크럽을 인메모리로.

export interface LeanStock {
    code: string;
    base: number; // % 기준가
    times: number[]; // unix seconds asc
    close: number[]; // UN 종가(원)
    high: number[]; // running 고가(원)
    low: number[]; // running 저가(원)
    cumAmount: number[]; // 누적 거래대금(원)
}

export interface LeanBoard {
    date: string;
    stocks: LeanStock[];
}

export async function fetchDayBoard(date: string): Promise<LeanBoard> {
    const qs = new URLSearchParams({ date });
    const res = await fetch(`/api/day-board?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /day-board ${res.status}: ${body}`);
    }
    return res.json() as Promise<LeanBoard>;
}
