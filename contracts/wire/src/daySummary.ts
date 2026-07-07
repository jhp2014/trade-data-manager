// /day-summary 계약 — 테마보드용 당일 요약(스냅샷 + byTheme 인덱스). 화면 전용 read model(api 소유, core 아님).
// 실제 응답은 EnrichedDaySummary(스냅샷에 EOD 축약 folding 필드 추가). 필터·순위는 클라 몫.

/** 시트 멤버십 한 건 — 테마명 + 편입메타(정적 정체성). admission* = "왜/언제 편입". */
export interface ThemeTag {
    theme: string;
    admissionIssue?: string;
    admissionDate?: string;
}

/**
 * 당일 스냅샷 — (date, stock) 그레인. EOD 일봉 파생(%)은 조정 불변이라 미리 구움(일봉 미수집이면 % 전부 null).
 * name·market·themes 는 조립 때 메모리 캐시에서, comment 는 fresh 로 붙는다(당일 종목 코멘트, 없으면 null).
 */
export interface DailySnapshot {
    date: string;
    stockCode: string;
    name: string | null;
    market: string | null;
    changeRate: number | null;
    openPct: number | null;
    highPct: number | null;
    lowPct: number | null;
    amount: string | null; // 그날 거래대금(원, UN, 무손실 string)
    marketCap: string | null; // 그 거래일 시총(원, 무손실 string)
    themes: ThemeTag[];
    comment: string | null; // 당일 종목 코멘트(사람 편집, 없으면 null)
}

/** 테마보드 스냅샷 — EOD 축약 folding 필드 추가. 분봉 없는 종목은 두 필드 생략. */
export interface EnrichedSnapshot extends DailySnapshot {
    bucketCounts?: number[]; // EOD 거래대금 구간 횟수(길이 7)
    trailingHighs?: number[]; // 매 거래일 high%(index=daysAgo, 0=당일) — 신고가 근접 필터
}

/** 당일 요약 — 스냅샷들 + 테마 인덱스. byTheme 는 stocks 를 코드로 가리킴(중복 없음). */
export interface DaySummary {
    date: string;
    stockCount: number;
    themes: string[];
    byTheme: Record<string, string[]>;
    stocks: DailySnapshot[];
}

/** /day-summary 응답 — enriched 스냅샷. */
export interface EnrichedDaySummary extends Omit<DaySummary, "stocks"> {
    stocks: EnrichedSnapshot[];
}
