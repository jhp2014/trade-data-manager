/* ===========================================================
 * Deck — CSV 기반 시점 모음
 * =========================================================== */

export interface DeckEntry {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
    options: Record<string, string>;
    priceLines: Record<string, number[]>;
    sourceFile: string;
}

export interface LoadedDecks {
    entries: DeckEntry[];
    optionKeys: string[];
    priceLineKeys: string[];
    files: string[];
    duplicateCount: number;
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
