// 당일 요약 조립(순수, IO 0). fetch 는 소비측(api DayBoards)이 하고, 여긴 조립만.
//  · assembleBaseSnapshots — 파일 파생(EOD %·시총) + 메모리 캐시(master·시트) 조인 → 스냅샷 스켈레톤(issues=[])
//  · applyIssues           — 그 스켈레톤에 fresh issues 를 덮음(가변이라 캐시 밖, 편집 즉시 반영)
//  · buildDaySummary       — 스냅샷들 → byTheme/byIssue 인덱스(flat 한 패스 파생, 단일 진실원본)
import type { DailySnapshot, DaySummary, ThemeTag, IssueTag } from "#port/query";
import type { StockMaster, ThemeMember, DailyIssue, DayStats } from "#domain";

/** 시트 멤버십 ∩ universe → 종목별 ThemeTag[](편입이슈·날짜 메타 보존, 멤버 등장순 유지). */
function themeTagsByCode(members: ThemeMember[], codes: string[]): Map<string, ThemeTag[]> {
    const set = new Set(codes);
    const out = new Map<string, ThemeTag[]>();
    for (const m of members) {
        if (!set.has(m.code)) continue;
        const tag: ThemeTag = { theme: m.theme };
        if (m.issue) tag.admissionIssue = m.issue;
        if (m.date) tag.admissionDate = m.date;
        const arr = out.get(m.code);
        if (arr) arr.push(tag);
        else out.set(m.code, [tag]);
    }
    return out;
}

/** 코드별 파일 파생값 — EOD 일봉 %(불변) + 시총. api DayBoards 가 파일에서 뽑아 넘긴다. */
export interface DaySnapshotFields {
    stats: DayStats | null;
    marketCap: string | null;
}

/**
 * 파일 파생(EOD %·시총) + master·시트를 stock_code 로 조인 → 스냅샷 스켈레톤(issues=[]).
 * universe 주도(시트에 없는 종목도 미분류로 나옴). issues 만 가변이라 여기서 뺀다(소비측이 applyIssues 로 fresh 덮음).
 */
export function assembleBaseSnapshots(
    date: string,
    codes: string[],
    meta: { members: ThemeMember[]; masters: StockMaster[]; byCode: Map<string, DaySnapshotFields> },
): DailySnapshot[] {
    const themes = themeTagsByCode(meta.members, codes);
    const masterByCode = new Map(meta.masters.map((m) => [m.stockCode, m]));
    return codes.map((code) => {
        const master = masterByCode.get(code);
        const f = meta.byCode.get(code);
        const s = f?.stats ?? null;
        return {
            date,
            stockCode: code,
            name: master?.name ?? null,
            market: master?.market ?? null,
            changeRate: s?.changeRate ?? null,
            openPct: s?.openPct ?? null,
            highPct: s?.highPct ?? null,
            lowPct: s?.lowPct ?? null,
            amount: s?.amount ?? null,
            marketCap: f?.marketCap ?? null,
            themes: themes.get(code) ?? [],
            issues: [],
        };
    });
}

/** 스냅샷 스켈레톤에 fresh issues 를 덮는다(편집 즉시 반영). issue 없는 종목은 그대로. */
export function applyIssues(base: DailySnapshot[], issues: DailyIssue[]): DailySnapshot[] {
    const byCode = new Map<string, IssueTag[]>();
    for (const i of issues) {
        const tag: IssueTag = { issue: i.issue, author: i.author };
        if (i.comment !== undefined) tag.comment = i.comment;
        const arr = byCode.get(i.stockCode);
        if (arr) arr.push(tag);
        else byCode.set(i.stockCode, [tag]);
    }
    return base.map((s) => {
        const issueTags = byCode.get(s.stockCode);
        return issueTags ? { ...s, issues: issueTags } : s;
    });
}

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
