// buildDaySummary — 스냅샷들 → 당일 요약(순수, IO 0). rich(byTheme/byIssue)는 flat(stocks) 한 패스 파생이라
// 절대 안 어긋난다(단일 진실원본). 종목이 다중 테마/이슈면 각 키에 코드가 등장(같은 키 중복 코드는 dedup).
// 입력 등장순서 유지. 순위/필터는 클라 몫 — 여긴 인덱싱만.
import type { DailySnapshot, DaySummary } from "#port/inbound";

export function buildDaySummary(date: string, stocks: DailySnapshot[]): DaySummary {
    const byTheme: Record<string, string[]> = {};
    const byIssue: Record<string, string[]> = {};
    const push = (index: Record<string, string[]>, key: string, code: string): void => {
        const arr = index[key];
        if (!arr) index[key] = [code];
        else if (!arr.includes(code)) arr.push(code);
    };
    for (const s of stocks) {
        for (const t of s.themes) push(byTheme, t.theme, s.stockCode);
        for (const i of s.issues) push(byIssue, i.issue, s.stockCode);
    }
    return {
        date,
        stockCount: stocks.length,
        themes: Object.keys(byTheme),
        issues: Object.keys(byIssue),
        byTheme,
        byIssue,
        stocks,
    };
}
