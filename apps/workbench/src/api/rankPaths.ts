// 순위 필터 분석 경로 타입(진입가 앵커 %). 이제 서버 파생이 아니라, 클라가 raw 분봉(/rank-minutes)을
// core/market entryAnchoredBars 로 정규화해 만든다([[port-cqrs-split]] 계산경계). 이 파일은 wire 타입 재노출만.
export type { RankPointPath, RankPathBar } from "@trade-data-manager/wire";
