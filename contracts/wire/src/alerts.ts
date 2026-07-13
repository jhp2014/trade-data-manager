// 알람(watchlist) 계약 — apps/live REST(/live/watchlist·/live/alerts)와 workbench 타겟 패널 공유.
// 룰 설정 모양은 apps/live 의 JSON 영속과도 동일(단일 출처 — apps/live 가 이 타입을 import).

/**
 * 가격 조건 — 비대칭 밴드 [하단,상단] "진입" 엣지. 경계는 baseline 대비 %(음수=아래) 또는 null=무제한.
 * 상단 null([-X,∞)): 갭으로 관통해도 잡는다 / 유계([+A,+B]): 밴드를 뛰어넘는 런어웨이는 패스.
 * baseline 은 룰 생성 시점가(장전 생성=전일종가)로 서버가 해소해 저장.
 */
export interface BandCondition {
    baseline: number; // 원화 절대가
    lowerPct: number | null; // null = -∞
    upperPct: number | null; // null = +∞
}

/** 순위 조건 — 테마 내 거래대금 순위(themeRank). reach=도달(rank≤threshold) / delta=변동(60s 창 상승 계단 ≥threshold). */
export interface RankCondition {
    theme: string; // 종목이 여러 테마면 사용자가 지정
    mode: "reach" | "delta";
    threshold: number;
}

/** 알람 룰 한 개 — watchlist 종목에 귀속. band/rank 중 최소 1개, 둘 다 있으면 AND. */
export interface AlertRule {
    id: string;
    code: string;
    band?: BandCondition;
    rank?: RankCondition;
    /** 발화 후 최소 재발화 간격 ms(생략=서버 기본 3분). 재무장(하강 엣지)과 별도로 적용. */
    cooldownMs?: number;
    /** 사용자 메모(알림 메시지에 실림). */
    note?: string;
}

/** 발화 한 건 — 알림 페이로드·최근 발화 로그. */
export interface AlertFiring {
    ruleId: string;
    code: string;
    name: string;
    at: number; // epoch ms
    features: {
        price: number;
        changeRate: number;
        baselinePct: number | null; // 밴드 룰이면 baseline 대비 현재 %
        themeRank: number | null;
        themeRankDelta: number | null;
    };
    note?: string;
}

/** 룰 + 런타임 상태(읽기 전용) — GET /live/watchlist 응답의 룰 모양. */
export interface AlertRuleView extends AlertRule {
    /** 현재 술어값(true=조건 안). undefined = 아직 첫 평가 전. 재무장 여부 표시용. */
    inZone?: boolean;
    lastFiredAt?: number | null;
}

/** GET /live/watchlist — 타겟 패널이 폴링하는 전체 뷰. */
export interface WatchlistView {
    codes: string[]; // watchlist 종목(수동 정렬 없음 — 표시는 스냅샷 시세로)
    rules: AlertRuleView[];
    firings: AlertFiring[]; // 최근 발화(최신순, 서버 메모리 상한)
}
