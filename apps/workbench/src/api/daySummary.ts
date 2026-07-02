// /day-summary 조회 클라이언트 — 패널이 쓰는 부분집합만 로컬 wire 타입으로 둔다(core 디커플).
// 차트(분봉)·순위·필터는 클라 몫이므로 이 read model 한 덩어리를 받아 파생한다.

export interface ThemeTag {
    theme: string;
    admissionIssue?: string;
    admissionDate?: string;
}

export interface IssueTag {
    issue: string;
    comment?: string;
    author: string;
}

export interface DailySnapshot {
    date: string;
    stockCode: string;
    name: string | null;
    market: string | null;
    themes: ThemeTag[];
    issues: IssueTag[];
}

export interface DaySummary {
    date: string;
    stockCount: number;
    themes: string[];
    issues: string[];
    byTheme: Record<string, string[]>;
    byIssue: Record<string, string[]>;
    stocks: DailySnapshot[];
}

export async function fetchDaySummary(date: string): Promise<DaySummary> {
    const qs = new URLSearchParams({ date });
    const res = await fetch(`/api/day-summary?${qs}`);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GET /day-summary ${res.status}: ${body}`);
    }
    return res.json() as Promise<DaySummary>;
}
