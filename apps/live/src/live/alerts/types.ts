// 알람 서브시스템 타입 — 설정·발화 모양은 contracts/wire 가 단일 출처(REST·JSON 영속·패널 공유).
// 여기는 재노출 + 런타임 전용(무장 상태·기본값)만. framework-free.
// 설계: [[alert-conditions-dnf-redesign]] — 조건 = leaf(AND) 리스트(OR=조건 여러 개),
// leaf 2종(가격 절대임계·테마 등락률순위), 엣지 발화 + 쿨다운(재무장=하강 엣지).
export type {
    AlertRule,
    AlertFiring,
    AlertRuleView,
    AlertLeaf,
    AlertLogEntry,
    AlertLogView,
    AlertMarket,
    AlertOp,
    AlertScope,
    LeafEvidence,
    PriceLeaf,
    RankLeaf,
    WatchlistView,
} from "@trade-data-manager/wire";

/** 종목당 텔레그램 재배달 최소 간격(룰이 cooldownMs 를 안 주면 이 값). 발화는 막지 않는다 — NotifyGate 소유. */
export const DEFAULT_COOLDOWN_MS = 180_000; // 3분

/** 조건의 런타임 무장 상태(영속 안 함 — 재기동 시 재무장). */
export interface RuleRuntimeState {
    /** 직전 틱 술어값 — 엣지(false→true) 판정용. */
    inZone: boolean;
    /** 마지막 **발화** 시각(배달 여부와 무관 — 배달은 NotifyGate 가 따로 억제). */
    lastFiredAt: number | null;
}
