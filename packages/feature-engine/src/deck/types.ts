/* ===========================================================
 * Deck — CSV 기반 시점 모음
 * =========================================================== */

export interface DeckEntry {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
    options: Record<string, string>;
    sourceFile: string;
}

export interface LoadedDecks {
    entries: DeckEntry[];
    optionKeys: string[];
    files: string[];
    duplicateCount: number;
}

/* ===========================================================
 * 필터
 * =========================================================== */

export interface DeckFilter {
    optionEquals?: Record<string, string>;
    optionIn?: Record<string, string[]>;
    optionIncludes?: Record<string, string>;
    optionPrefix?: Record<string, string>;
    optionPresent?: string[];
    stockCodes?: string[];
    fromDate?: string;
    toDate?: string;
}

/* ===========================================================
 * 분석 결과
 *
 * 카드 한 장이 표시할 데이터를 명시적으로 정의.
 * v0.2: selfMetrics + stockName 까지 실데이터.
 * v0.3 (예정): themePeers 실데이터.
 * =========================================================== */

export interface StockMetrics {
    stockCode: string;
    stockName: string;
    /** 현재 종가 등락률 (NXT 기준), % */
    closeRate: number | null;
    /** 누적 거래대금 (원) */
    cumulativeAmount: bigint | null;
    /** 당일 고점 등락률, % */
    dayHighRate: number | null;
    /** 고점 대비 현재 위치 (음수=눌림), % */
    pullbackFromHigh: number | null;
    /** 100억 이상 분봉 누적 횟수 */
    cnt100Amt: number | null;
}

export interface AnalyzedEntry {
    entry: DeckEntry;
    /** 자기 종목의 해당 시점 지표 (selfFeature 미존재 시 stockName만 채워지고 나머지는 null) */
    self: StockMetrics | null;
    /** v0.3에서 채워질 예정 — 지금은 빈 배열 */
    themePeers: ThemePeerGroup[];
}

export interface ThemePeerGroup {
    themeId: string; // bigint → 직렬화 안전을 위해 string
    themeName: string;
    peers: StockMetrics[];
}

/* ===========================================================
 * 키 헬퍼
 * =========================================================== */

export function makeEntryKey(e: {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
}): string {
    return `${e.stockCode}|${e.tradeDate}|${e.tradeTime}`;
}
