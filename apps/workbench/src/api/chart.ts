// /chart 조회 클라이언트 — 프론트를 core/market 에서 디커플링하기 위해 렌더에 필요한
// 최소 wire 타입만 로컬 정의한다(core 의 ChartBundle 구조 부분집합). 모든 가격은 무손실 string.

export interface DailyBar {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    amount: string;
}

export interface DailyCandle {
    stockCode: string;
    date: string; // YYYY-MM-DD
    krx: DailyBar;
    un: DailyBar;
}

export interface MinuteCandleWire {
    stockCode: string;
    date: string;
    time: string; // HH:MM:SS
    krx: DailyBar | null;
    un: DailyBar;
}

export interface ChartBundle {
    stockCode: string;
    daily: DailyCandle[];
    minutes: MinuteCandleWire[];
}

export async function fetchChart(code: string, date: string): Promise<ChartBundle> {
    const qs = new URLSearchParams({ code, date });
    const res = await fetch(`/api/chart?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /chart ${res.status}: ${body}`);
    }
    return res.json() as Promise<ChartBundle>;
}
