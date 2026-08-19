import { createPoolFromEnv } from "@trade-data-manager/persistence";

// pg 를 직접 의존하지 않고 Pool 타입을 persistence 팩토리에서 파생한다(가장자리 결합 최소화).
// 화면별 provider 파일들과 모듈(수명 관리)이 같은 타입을 본다 — 여기 한 곳에서만 파생한다.
export type Pool = ReturnType<typeof createPoolFromEnv>;
