/* ===========================================================
 * Deck — CSV 기반 시점 모음
 *
 * 필수 컬럼: stockCode, tradeDate, tradeTime
 * 그 외 모든 컬럼은 options에 자유롭게 들어감 (memo, pattern, strength 등)
 * =========================================================== */

export interface DeckEntry {
    stockCode: string;
    tradeDate: string;             // "YYYY-MM-DD"
    tradeTime: string;             // "HH:mm:ss"
    options: Record<string, string>;
    sourceFile: string;            // 어느 csv에서 왔는지 (디버깅용)
}

export interface LoadedDecks {
    /** 모든 csv를 합치고 (stockCode, tradeDate, tradeTime) 기준 dedupe된 entries */
    entries: DeckEntry[];
    /** 등장한 모든 옵션 컬럼명 (csv들의 합집합) */
    optionKeys: string[];
    /** 로드한 파일 절대 경로 목록 */
    files: string[];
    /** dedupe 과정에서 제거된 중복 행 수 */
    duplicateCount: number;
}

/* ===========================================================
 * 필터 — 메모리 자료구조 위에서 수행
 * =========================================================== */

export interface DeckFilter {
    // 옵션값 정확히 일치
    optionEquals?: Record<string, string>;
    // 옵션값이 여러 후보 중 하나
    optionIn?: Record<string, string[]>;
    // 옵션값에 특정 문자열 포함 (| 구분자 다중값 처리)
    optionIncludes?: Record<string, string>;
    // 옵션값 prefix 매칭 (트리식 표현 시)
    optionPrefix?: Record<string, string>;
    // 옵션값이 비어있지 않은 entry만
    optionPresent?: string[];
    // 종목·날짜 범위
    stockCodes?: string[];
    fromDate?: string;
    toDate?: string;
}

/* ===========================================================
 * 분석 결과
 * =========================================================== */

export interface AnalyzedEntry {
    entry: DeckEntry;
    /** 해당 종목·날짜·시간의 분봉 피처 (없으면 null) */
    selfFeature: Record<string, any> | null;
    /** 같은 (themeId, tradeDate)의 동반 종목 분봉 피처 */
    themePeers: ThemePeerGroup[];
}

export interface ThemePeerGroup {
    themeId: bigint;
    themeName: string;
    /** 자기 자신을 제외한 같은 시점의 동반 종목 분봉 피처 */
    peers: Record<string, any>[];
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
