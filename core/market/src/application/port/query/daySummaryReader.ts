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
