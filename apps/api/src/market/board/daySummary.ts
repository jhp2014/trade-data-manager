// 당일 요약 읽기모델(api) — /day-summary·/day-replay 응답 조립. 특정 화면 전용이라 app 이 소유(core 아님).
//   타입: ThemeTag·IssueTag·DailySnapshot·DaySummary — api↔클라 wire 계약(workbench 는 자기 로컬 wire 로 디커플).
//   순수함수(IO 0): assembleBaseSnapshots(파일파생+master·시트 조인) · applyIssues(fresh 이슈 덮기) · buildDaySummary(byTheme/byIssue 인덱스).
// fetch·캐시는 DayBoards 가 하고, 여긴 순수 조립만. core 는 도메인(DayStats 등)만 계속 제공.
import type { StockMaster, ThemeMember, DailyIssue, DayStats } from "@trade-data-manager/market";

/**
 * 시트 멤버십 한 건을 스냅샷에 실은 형태 — 테마명 + 편입메타(정적 정체성).
 * admissionIssue(편입이슈)·admissionDate(편입일)는 "왜/언제 이 테마에 편입됐나"로,
 * 당일 촉매(IssueTag.issue)와는 다른 레이어다(2층 모델).
 */
export interface ThemeTag {
    theme: string;
    admissionIssue?: string;
    admissionDate?: string;
}

/** 당일 확정 이슈 한 건 — issue(그룹 키) + 행별 메타(comment·author). */
export interface IssueTag {
    issue: string;
    comment?: string;
    author: string;
}

/**
 * 당일 스냅샷 — (date, stock) 그레인. 차트를 빼고 "종목의 그날"을 관심종목 한 줄로 표현하는 데 필요한 스칼라 전부.
 * EOD 일봉 파생(%)은 **조정 불변**이라 미리 구워 싣는다(candle/prevClose 원값 대신 % — 자가치유 무관, 파일 캐시 가능).
 * name·market·themes 는 조립 때 메모리 캐시(Master·Membership)에서, issues 는 fresh 로 붙인다.
 */
export interface DailySnapshot {
    date: string;
    stockCode: string;
    /** master 결손(폐지·미수집)이면 null. */
    name: string | null;
    market: string | null;
    /** EOD 일봉 파생(직전 UN 종가 대비 %). 일봉 미수집이면 전부 null. UN(통합) 기준. */
    changeRate: number | null;
    openPct: number | null;
    highPct: number | null;
    lowPct: number | null;
    /** 그날 거래대금(원, UN, 무손실 string). 일봉 미수집이면 null. */
    amount: string | null;
    /** 그 거래일 시총(원, 무손실 string). 미백필이면 null. */
    marketCap: string | null;
    /** 시트 축(정적). 빈 배열 = 미분류(시트에 없거나 universe 매칭 없음). */
    themes: ThemeTag[];
    /** daily_issues 축(당일 촉매). 빈 배열 = 이슈 미확정. */
    issues: IssueTag[];
}

/**
 * 당일 요약 — 스냅샷들 + 두 축(테마/이슈) 인덱스. byTheme/byIssue 는 stocks 를 가리키는 코드 참조라 중복 없음.
 * 전부 stocks 하나에서 buildDaySummary 순수함수가 한 패스로 파생(단일 진실원본 → flat 과 안 어긋남).
 */
export interface DaySummary {
    date: string;
    stockCount: number;
    /** 당일 존재하는 테마 종류(byTheme 키). */
    themes: string[];
    /** 당일 존재하는 이슈 종류(byIssue 키). */
    issues: string[];
    byTheme: Record<string, string[]>;
    byIssue: Record<string, string[]>;
    /** 캐노니컬 enriched 스냅샷들. byTheme/byIssue 가 이걸 코드로 가리킨다. */
    stocks: DailySnapshot[];
}

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

/** 코드별 파일 파생값 — EOD 일봉 %(불변) + 시총. DayBoards 가 파일에서 뽑아 넘긴다. */
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
