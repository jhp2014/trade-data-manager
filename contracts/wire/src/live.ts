// 실시간 모니터(apps/live) → workbench 라이브 스냅샷 계약. 화면 전용 read model 봉투(apps/live 소유).
// SSE GET /live/stream · 폴백 GET /live/snapshot 둘 다 이 모양. 런타임 코드 0 — 전부 타입.

/** 키움 WS 연결 상태(배너용). */
export type LiveConnectionStatus = "closed" | "connecting" | "reconnecting" | "live";

/** 라이브 hot 종목 1개 — ka10095 시세 기반. (후속: themeRank·dim 추가) */
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
    /** 속한 테마들(시트 멤버십). 빈 배열=미분류. 칩/그룹핑용. */
    themes: string[];
    /** 과거 완결 거래일 고가%(전일종가 대비, 최신→과거, 최대 120). 신고가 근접 필터 원자재 — 클라가 index 0 에 당일 highPct prepend. 미계산이면 없음. */
    trailingHighs?: number[];
    /** 활성 1분 델타 신호(돈유입). 미발화면 없음. core DeltaHit 과 구조 동일(wire 는 core 미의존이라 재선언). tvDelta 단위=원. */
    signal?: { label: string; rateDelta: number; tvDelta: number };
    /** watchlist(타겟) 종목 — 스캔(hot) 이탈해도 계속 폴링·표시. 타겟 패널 필터 키. */
    watched?: boolean;
}

/** 매 틱(5초) 스냅샷 — 서버가 조립, 클라는 표시만. */
export interface LiveSnapshot {
    ts: number;
    status: LiveConnectionStatus;
    hot: number; // 스캔 hit 수
    polled: number; // 시세 보유 종목 수
    stocks: LiveStock[];
}

/** 키움 서버저장 조건검색식 1개(CNSRLST 행). */
export interface LiveConditionEntry {
    seq: string;
    name: string;
}

/** GET /conditions — 조건검색식 목록 + 현재 선택(빈 문자열=미선택, 엔진은 watchlist 만 폴링). */
export interface LiveConditionsView {
    current: string;
    list: LiveConditionEntry[];
}
