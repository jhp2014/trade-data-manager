// 알람 서브시스템 공용 타입 — 설정(JSON 영속)과 발화(런타임). framework-free.
// 설계: [[realtime-monitor-trader-design]] 모니터링+알람 상세 — 알람은 watchlist(타겟) 종목에만,
// 룰 = 가격 밴드 · 순위 2종(둘 다 있으면 AND), 엣지 발화 + 쿨다운(재무장=하강 엣지).

/**
 * 가격 룰 — 비대칭 밴드 [하단,상단] "진입" 엣지. 경계는 baseline 대비 %(음수=아래) 또는 null=무제한.
 * 상단 null([-X,∞)): 갭으로 관통해도 잡는다 / 유계([+A,+B]): 밴드를 뛰어넘는 런어웨이는 패스.
 * baseline 은 룰 생성 시점가(장전 생성=전일종가)로 서버가 해소해 저장한다.
 */
export interface BandCondition {
    baseline: number; // 원화 절대가
    lowerPct: number | null; // null = -∞
    upperPct: number | null; // null = +∞
}

/** 순위 룰 — 테마 내 거래대금 순위(themeRank). reach=도달(rank≤k) / delta=변동(60s 창 개선 계단 ≥d). */
export interface RankCondition {
    theme: string; // 종목이 여러 테마면 사용자가 지정
    mode: "reach" | "delta";
    /** reach: k(순위 상한, 1=테마 1등) / delta: d(창 내 순위 상승 계단 수). */
    threshold: number;
}

/** 알람 룰 한 개 — watchlist 종목에 귀속. band/rank 중 최소 1개, 둘 다 있으면 AND. */
export interface AlertRule {
    id: string;
    code: string;
    band?: BandCondition;
    rank?: RankCondition;
    /** 발화 후 최소 재발화 간격 ms(기본 DEFAULT_COOLDOWN_MS). 재무장(하강 엣지)과 별도로 적용. */
    cooldownMs?: number;
    /** 사용자 메모(텔레그램 payload 에 실림). */
    note?: string;
}

export const DEFAULT_COOLDOWN_MS = 180_000; // 3분 — 진동성 재발화 억제(재무장과 AND)

/** 발화 한 건 — 전달(텔레그램)·상태 노출용 피처 동봉. */
export interface AlertFiring {
    ruleId: string;
    code: string;
    name: string; // 시세에서(비어있을 수 있음)
    at: number; // epoch ms
    /** 발화 시점 피처 — 메시지 본문 재료. */
    features: {
        price: number;
        changeRate: number;
        baselinePct: number | null; // 밴드 룰이면 baseline 대비 현재 %
        themeRank: number | null; // 순위 룰이면 현재 순위
        themeRankDelta: number | null; // 순위 룰(delta)이면 창 내 상승 계단
    };
    note?: string;
}

/** 룰의 런타임 무장 상태(영속 안 함 — 재기동 시 재무장). */
export interface RuleRuntimeState {
    /** 직전 틱 술어값 — 엣지(false→true) 판정용. */
    inZone: boolean;
    lastFiredAt: number | null;
}
