// 알람 서브시스템 타입 — 설정·발화 모양은 contracts/wire 가 단일 출처(REST·JSON 영속·패널 공유).
// 여기는 재노출 + 런타임 전용(무장 상태·기본값)만. framework-free.
// 설계: [[realtime-monitor-trader-design]] — 조건 = 그룹(OR)들의 DNF, 그룹 = leaf(AND)들,
// leaf 3종(가격 절대임계·등락률·테마 등락률순위), 엣지 발화 + 쿨다운(재무장=하강 엣지).
export type {
    AlertRule,
    AlertFiring,
    AlertRuleView,
    AlertLeaf,
    AlertGroup,
    AlertMarket,
    AlertOp,
    PriceLeaf,
    RateLeaf,
    RankLeaf,
    WatchlistView,
} from "@trade-data-manager/wire";

export const DEFAULT_COOLDOWN_MS = 180_000; // 3분 — 진동성 재발화 억제(재무장과 AND)

/** 조건의 런타임 무장 상태(영속 안 함 — 재기동 시 재무장). */
export interface RuleRuntimeState {
    /** 직전 틱 술어값 — 엣지(false→true) 판정용. */
    inZone: boolean;
    lastFiredAt: number | null;
}
