// 실시간 모니터(apps/live) → workbench 라이브 스냅샷 계약. 화면 전용 read model 봉투(apps/live 소유).
// SSE GET /live/stream · 폴백 GET /live/snapshot 둘 다 이 모양. 런타임 코드 0 — 전부 타입.

/** 키움 WS 연결 상태(배너용). */
export type LiveConnectionStatus = "closed" | "connecting" | "reconnecting" | "live";

/** 라이브 hot 종목 1개 — ka10095 시세 기반. (후속: signal·themeRank·dim 추가) */
export interface LiveStock {
    code: string;
    name: string;
    price: number;
    changeRate: number;
    tradeValue: number; // 누적 거래대금(백만원)
    marketCap: number; // 시가총액(억원)
    openPct: number;
    highPct: number;
    lowPct: number;
    newlyHot: boolean;
}

/** 매 틱(5초) 스냅샷 — 서버가 조립, 클라는 표시만. */
export interface LiveSnapshot {
    ts: number;
    status: LiveConnectionStatus;
    hot: number; // 스캔 hit 수
    polled: number; // 시세 보유 종목 수
    stocks: LiveStock[];
}
