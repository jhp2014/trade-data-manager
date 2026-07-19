// 실시간 모니터(apps/live) → workbench 라이브 스냅샷 계약. 화면 전용 read model 봉투(apps/live 소유).
// SSE GET /live/stream · 폴백 GET /live/snapshot 둘 다 이 모양. 런타임 코드 0 — 전부 타입.

/** 키움 WS 연결 상태(배너용). */
export type LiveConnectionStatus = "closed" | "connecting" | "reconnecting" | "live";

/**
 * 라이브 hot 종목 1개 — ka10095 시세 기반. 가격은 **원주가 값**(당일 실체결)으로 내려주고
 * %는 클라가 기준 시장(KRX/UN) 기준가(basePrice)로 계산한다(복기와 같은 "값+base" 철학).
 * base_pric 의미론 비의존 — 자체 일봉에서 배급한 basePrice 가 정본, base 는 준비 전 폴백.
 */
export interface LiveStock {
    code: string;
    name: string;
    price: number; // 현재가(원주가)
    changeRate: number; // 키움 표기 등락률(flu_rt, 기준가 대비) — 참고용. 보드 %는 클라 계산.
    tradeValue: number; // 누적 거래대금(백만원)
    marketCap: number; // 시가총액(억원)
    open: number; // 당일 시가(원주가 값)
    high: number; // 당일 고가
    low: number; // 당일 저가
    base: number; // ka10095 base_pric(전일 기준가) — rawPrevClose 준비 전(핫 편입 직후) 폴백 base
    newlyHot: boolean;
    /** 속한 테마들(시트 멤버십). 빈 배열=미분류. 칩/그룹핑용. */
    themes: string[];
    /** 등락률 기준가(시장별, 당일 원주가 스케일 — 감자·액분 이벤트 보정) — 일봉 컨텍스트 캐시. 준비 전엔 없음(클라는 base 폴백). */
    basePrice?: { krx: number | null; un: number | null };
    /** 과거 완결 거래일 고가%(수정주가, 시장별 자기 전일종가 대비, 최신→과거, 최대 120). 클라가 index 0 에 당일 고가% prepend. 미계산이면 없음. */
    trailingHighs?: { krx: number[]; un: number[] };
    /** 활성 1분 델타 신호(돈유입). 미발화면 없음. core DeltaHit 과 구조 동일(wire 는 core 미의존이라 재선언). tvDelta 단위=원. */
    signal?: { label: string; rateDelta: number; tvDelta: number };
    /**
     * 30초·1분 원시 델타(등락률 %p·거래대금 억) — 클라 보드 필터의 signal 술어가 **자기 임계**로 판정
     * (원재료 배급 철학: 임계를 서버에 박으면 필터 조절마다 왕복). 이력 부족 창은 없음. core SignalDeltas 재선언.
     */
    deltas?: { d30s?: { rate: number; tvEok: number }; d1m?: { rate: number; tvEok: number } };
    /** 이 종목의 테마별 등락률 순위(시장별, 유니버스 내 — 알람 rank 술어와 같은 잣대). rank 술어(any-theme) 입력. */
    ranks?: { krx: number[]; un: number[] };
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
