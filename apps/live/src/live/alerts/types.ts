// 알람 서브시스템 타입 — 설정·발화 모양은 contracts/wire 가 단일 출처(REST·JSON 영속·패널 공유).
// 여기는 재노출 + 런타임 전용(기본값)만. framework-free.
// 설계: [[alert-context-expansion]] 4b — 통합 규칙(AlarmRule: code 스코프=집중감시/없으면 유니버스 탐지),
// 술어는 core 레지스트리(BOARD_PREDICATES), 엔진 한 벌(AlarmEngine), 결손 정책은 스코프별.
export type {
    AlarmPredicateInstance,
    AlarmRule,
    AlarmRuleView,
    AlertDelivery,
    AlertFiring,
    AlertLogEntry,
    AlertLogView,
    AlertMarket,
    AlertScope,
    AlertThemeContext,
    AlertThemeMember,
    BlacklistEntry,
    CooldownKeyMode,
    LeafEvidence,
    UniverseView,
    WatchlistView,
} from "@trade-data-manager/wire";

export const DEFAULT_COOLDOWN_MS = 180_000; // 3분 — 텔레그램 재배달 최소 간격 기본(규칙이 cooldownMs 미지정 시)
