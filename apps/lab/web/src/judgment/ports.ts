// 판단 저장소 창구 — 패널은 이 인터페이스만 안다(시장 데이터 창구 market/ports.ts 와 별개: 출처가 다르다).
// 지금 구현은 임시 서버(judgment/server.ts → /judgment/*). tdm 이 이력을 내려 주게 되면 구현만 바꾼다.
import type { HistoryThemes, StockHistory } from "./types.js";

/** 이슈 이력 읽기 — 늘 기준일 **이전** 이력만 쓴다(그날 · 그 뒤에 생긴 테마가 섞이지 않게). */
export interface HistoryStore {
    /** 그날 이전 이력으로 종목 → 테마들 · 이력이 덮는 기간. */
    historyThemes(date: string, signal?: AbortSignal): Promise<HistoryThemes>;
    /** 한 종목의 이력 · 그날의 장 마감 정리. 이력이 없으면 null. */
    stockHistory(code: string, date: string, signal?: AbortSignal): Promise<StockHistory | null>;
}

export type JudgmentStore = HistoryStore;
