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
 * 키 헬퍼
 * =========================================================== */

export function makeEntryKey(e: {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
}): string {
    return `${e.stockCode}|${e.tradeDate}|${e.tradeTime}`;
}
