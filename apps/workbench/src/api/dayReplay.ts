// /day-replay 조회 — 복기보드용 per-minute 파생값 + 메타(self-contained, daySummary 불필요).
// 모든 %는 원주가 직전 거래일 종가 대비(서버 계산). 클라는 시점 스냅샷만 파생.

export interface MinuteDerived {
    code: string;
    times: number[]; // unix seconds asc
    rate: number[]; // 등락률 %(분당 종가)
    high: number[]; // running 고가 %
    low: number[]; // running 저가 %
    open: number; // 당일 시가 %(스칼라)
    cumAmount: number[]; // 누적 거래대금(원)
}

/** per-minute 파생 + 메타(서버 stitch). 복기보드가 이 하나로 랭킹+카드 다 만든다. */
export interface ReplayStock extends MinuteDerived {
    name: string | null;
    market: string | null;
    marketCap: string | null;
    themes: string[];
}

export interface DayReplay {
    date: string;
    stocks: ReplayStock[];
}

export async function fetchDayReplay(date: string): Promise<DayReplay> {
    const qs = new URLSearchParams({ date });
    const res = await fetch(`/api/day-replay?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /day-replay ${res.status}: ${body}`);
    }
    return res.json() as Promise<DayReplay>;
}
