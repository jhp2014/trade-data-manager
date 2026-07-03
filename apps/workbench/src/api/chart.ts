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

/** 분봉 % 기준가 — 직전 거래일 원주가 종가(시장별) 스칼라. 상장 첫날 등 null 이면 클라가 당일 첫 시가 폴백. */
export interface RawBase {
    krxClose: string;
    unClose: string;
}

export interface ChartBundle {
    stockCode: string;
    daily: DailyCandle[];
    minutes: MinuteCandleWire[];
    rawBase: RawBase | null;
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
