import type { DailyCandle } from "#domain";

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
 * universe·시트·master·시총·일봉·전일종가·이슈를 stock_code 로 합친 읽기 투영(app 레이어 — 도메인은 깨끗하게).
 * 등락률(%)은 candle + prevClose 로 소비자가 순수함수 파생(여기 굽지 않음).
 */
export interface DailySnapshot {
    date: string;
    stockCode: string;
    /** master 결손(폐지·미수집)이면 null. */
    name: string | null;
    market: string | null;
    /** 그날 일봉(KRX+UN OHLC). 미수집이면 null. */
    candle: DailyCandle | null;
    /** 등락률 기준가 — 직전 거래일 시장별 종가. 없으면(신규상장 등) null → rate null. */
    prevCloseKrx: string | null;
    prevCloseUn: string | null;
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

/**
 * 당일 요약 리더(읽기 Query) — 날짜 하나로 그날 universe(분봉 있는 종목) 전체의 스냅샷 + 분류.
 * **universe 주도**라 시트에 없는 종목도 스냅샷으로 나온다(themes=[], =미분류) — 누락 없음.
 * 차트(분봉 시계열)·순위·필터는 클라 몫(스냅샷/도메인 순수함수로) — 여긴 스칼라까지만 stitch.
 */
export interface DaySummaryReader {
    summaryByDate(date: string): Promise<DaySummary>;
}
