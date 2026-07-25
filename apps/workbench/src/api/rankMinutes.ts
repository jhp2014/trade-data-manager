// 순위 필터 분석용 (종목,날) raw UN 분봉 조회 — 클라가 캐시에 없는 날만 배치로 POST.
// 정규화(진입가 앵커 %)는 core/market entryAnchoredBars 로 클라가 수행 → 부분집합 재조회 없음.
import type { RankDayMinutes } from "@trade-data-manager/wire";
import { apiPost } from "./http.js";

export type { RankDayMinutes, RankMinuteBar } from "@trade-data-manager/wire";

export interface DayRef {
    stockCode: string;
    date: string;
}

export const fetchRankMinutes = (days: DayRef[]): Promise<RankDayMinutes[]> => apiPost<RankDayMinutes[]>("rank-minutes", { days });
