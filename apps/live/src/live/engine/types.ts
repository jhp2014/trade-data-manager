// apps/live 엔진 공용 타입. 코드는 표준형 6자리로 통일(codes.ts). 정본: market-eye engine/types.ts(테마 제거).

/** ka10095 _AL 통합시세에서 뽑은 한 종목 스냅샷 (시세·거래대금의 유일한 소스). */
export interface Quote {
    code: string;
    name: string;
    price: number; // 현재가(부호 제거 양수)
    changeRate: number; // 등락률 %(하락 음수)
    volume: number; // 누적 거래량
    base: number; // 전일 기준가(0% 기준) — 캔들 % 환산용
    open: number;
    high: number;
    low: number;
    marketCap: number; // 시가총액(억원)
    tradeValue: number; // 누적 거래대금(백만원)
    ts: number; // 수신 epoch ms
}

/** 조건검색 스캐너가 준 한 종목 — 멤버십 + 종목명. */
export interface ScanHit {
    code: string;
    name: string;
}
