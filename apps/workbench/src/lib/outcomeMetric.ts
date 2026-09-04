// 결과 지표 어휘 — 술어(stage.ts)·파생(useOutcomes)·레일·시트가 공유하는 잎(leaf) 모듈.
// stage.ts 가 파싱에서 **런타임으로** 이 목록을 봐야 해서, store 를 무는 useOutcomes 에 두면
// stage → useOutcomes → store → filterFunnelSlice → stage 순환이 생긴다 — 그래서 의존 0 인 여기 산다.
// 기준은 전부 Point 봉 종가(decisions.md "시그널 결과").

export type OutcomeMetric = "extHigh" | "dropFromHigh" | "dropFromClose" | "deltaExt";

export const OUTCOME_METRICS: readonly OutcomeMetric[] = ["extHigh", "dropFromHigh", "dropFromClose", "deltaExt"];

export const isOutcomeMetric = (v: unknown): v is OutcomeMetric => OUTCOME_METRICS.includes(v as OutcomeMetric);

export const OUTCOME_METRIC_NAME: Record<OutcomeMetric, string> = {
    extHigh: "연장 고점 %",
    dropFromHigh: "고점 대비 저가 %",
    dropFromClose: "종가 대비 저가 %",
    deltaExt: "Δ 연장폭",
};
