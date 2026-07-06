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
    /** EOD 일봉 파생(직전 UN 종가 대비 %, 조정 불변). 일봉 미수집이면 전부 null. 눕힌 캔들·등락률에 쓴다. */
    changeRate: number | null;
    openPct: number | null;
    highPct: number | null;
    lowPct: number | null;
    /** 그날 거래대금(원, UN, 무손실 string). 일봉 미수집이면 null. */
    amount: string | null;
    /** 그 거래일 시총(원, 무손실 string). 미백필이면 null. 주도주 tiered 판정에 쓴다. */
    marketCap: string | null;
    themes: ThemeTag[];
    issues: IssueTag[];
    /** 이슈 축약(EOD) — 서버 folding. 분봉 없는 종목은 생략. */
    bucketCounts?: number[]; // EOD 거래대금 구간 횟수(길이 7) — 이슈보드 hover
    trailingHighs?: number[]; // 매 거래일 high%(index=daysAgo, 0=당일) — 신고가 근접 필터
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
