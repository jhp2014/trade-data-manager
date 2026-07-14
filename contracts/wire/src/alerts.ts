// 알람(watchlist) 계약 — apps/live REST(/live/watchlist·/live/alerts)와 workbench 실시간 모니터링 패널 공유.
// 조건 모양은 apps/live 의 JSON 영속과도 동일(단일 출처 — apps/live 가 이 타입을 import).
//
// 조건 모델: 조건 = leaf(AND) 리스트. 발화 = 식 전체 참 진입 엣지 + 쿨다운.
//   · OR 은 조건을 여러 개 다는 것으로 대체(한 종목 여러 조건 = 아무거나 걸리면 발화).
//   · 밴드 = price≥하한 AND price≤상한 두 leaf 로 표현.
//   · 순위 leaf 는 시장(KRX/UN 전일종가) 을 고른다 — 이중-시장이라 등락률 순위가 시장마다 다름.

/** 비교 방향 — gte=이상(≥) / lte=이하(≤). */
export type AlertOp = "gte" | "lte";
/** 순위 기준 시장(전일종가). 가격 leaf 는 절대가라 시장 무관. */
export type AlertMarket = "krx" | "un";

/** 절대가격 임계(원) — 차트 좌클릭으로 캡처. op 방향으로 상/하한. */
export interface PriceLeaf {
    kind: "price";
    op: AlertOp;
    value: number; // 원화 절대가(>0)
}
/** 테마 등락률 순위 — reach=도달(순위≤threshold) / delta=60초 창 상승 계단(≥threshold). market=순위 잣대. */
export interface RankLeaf {
    kind: "rank";
    theme: string; // 종목이 여러 테마면 사용자가 지정
    market: AlertMarket;
    mode: "reach" | "delta";
    threshold: number; // reach=K(위) / delta=D(계단), 1 이상 정수
}
export type AlertLeaf = PriceLeaf | RankLeaf;

/** 알람 조건 한 개 — watchlist 종목에 귀속. leaves = AND(최소 1개). */
export interface AlertRule {
    id: string;
    code: string;
    leaves: AlertLeaf[];
    /** 발화 후 최소 재발화 간격 ms(생략=서버 기본 3분). 재무장(하강 엣지)과 별도로 적용. */
    cooldownMs?: number;
    /** 사용자 메모(알림 메시지에 실림). */
    note?: string;
}

/** 발화 한 건 — 알림 페이로드·최근 발화 로그. features = 발화 시점 스칼라(요약 표시용). */
export interface AlertFiring {
    ruleId: string;
    code: string;
    name: string;
    at: number; // epoch ms
    features: {
        price: number; // 발화 시점 현재가(원)
        changeRate: number; // ka10095 등락률 %(참고 표시용)
    };
    note?: string;
}

/** 조건 + 런타임 상태(읽기 전용) — GET /live/watchlist 응답의 조건 모양. */
export interface AlertRuleView extends AlertRule {
    /** 현재 술어값(true=조건 안). undefined = 아직 첫 평가 전(또는 데이터 결손). 재무장 여부 표시용. */
    inZone?: boolean;
    lastFiredAt?: number | null;
}

/** GET /live/watchlist — 실시간 모니터링 패널이 폴링하는 전체 뷰. */
export interface WatchlistView {
    codes: string[]; // watchlist 종목(수동 정렬 없음 — 표시는 스냅샷 시세로)
    rules: AlertRuleView[];
    firings: AlertFiring[]; // 최근 발화(최신순, 서버 메모리 상한)
    /** 이번 틱 테마 등락률 순위 — 키 `code|theme|market`(전 테마×양시장). 클라가 종목·시장·테마 골라 표시. */
    ranks: Record<string, number>;
}
