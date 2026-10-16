// 테스트용 판단 저장소 — 날짜별 종목 → 테마, (종목, 날짜)별 이력을 메모리에 둔다.
import type { JudgmentStore } from "./ports.js";
import type { Coverage, StockHistory } from "./types.js";

export interface FakeJudgmentData {
    /** 날짜 → 종목 → 테마들. 없는 날짜는 빈 소속. */
    themes?: Record<string, Record<string, string[]>>;
    /** `${code}@${date}` → 이력. 없으면 null(이력 없음). */
    stocks?: Record<string, StockHistory>;
    coverage?: Coverage | null;
    /** 날짜 → 소속 응답을 늦출 약속(주면 그것이 풀릴 때 돌려준다). */
    gate?: Record<string, Promise<void>>;
}

export function fakeJudgment({ themes = {}, stocks = {}, coverage = null, gate = {} }: FakeJudgmentData = {}): JudgmentStore {
    return {
        historyThemes: async (date) => {
            await gate[date];
            return { themes: new Map(Object.entries(themes[date] ?? {})), coverage };
        },
        stockHistory: async (code, date) => stocks[`${code}@${date}`] ?? null,
    };
}
