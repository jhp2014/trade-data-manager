/* ===========================================================
 * 태그 트리 (JSONB)
 *
 * 객체 → 카테고리/중간 노드 (자식이 더 있음)
 * 배열 → 자식들이 모두 leaf인 단축 표기
 * null → leaf 노드 (자식 없음)
 *
 * 예시:
 * {
 *   "돌파": {
 *     "강한 돌파": ["거래대금 동반", "갭상승 동반"],
 *     "약한 돌파": null
 *   }
 * }
 * =========================================================== */
export type TagTreeJson = {
    [key: string]: TagTreeJson | string[] | null;
};

export type TagScope = "daily" | "opinion";

/* ===========================================================
 * 메모리 표현 — UI/검증/검색용
 * =========================================================== */

export interface TagNode {
    name: string;          // "강한 돌파"
    path: string;          // "돌파/강한 돌파"
    depth: number;         // 1
    children: TagNode[];
    isLeaf: boolean;
}

export interface TagTree {
    scope: TagScope;
    roots: TagNode[];
    byPath: Map<string, TagNode>;
    allPaths: Set<string>;
}

/* ===========================================================
 * 마킹 / 일봉 태그 — 메모리에서 다루기 좋은 형태
 * =========================================================== */

export interface Opportunity {
    id: bigint;
    tradeDate: string;     // "YYYY-MM-DD"
    tradeTime: string;     // "HH:mm:ss"
    stockCode: string;
    themeId: bigint;
    tags: string[];
    memo: string;
}

export interface DailyTag {
    id: bigint;
    stockCode: string;
    tradeDate: string;
    tags: string[];
    memo: string;
}

/* ===========================================================
 * 키 헬퍼 (인덱스 Map의 키 표준)
 * =========================================================== */

export function makeStockDateKey(stockCode: string, tradeDate: string): string {
    return `${stockCode}|${tradeDate}`;
}

export function makeThemeDateKey(themeId: bigint, tradeDate: string): string {
    return `${themeId}|${tradeDate}`;
}

export function makeOpportunityKey(o: {
    tradeDate: string;
    tradeTime: string;
    stockCode: string;
    themeId: bigint;
}): string {
    return `${o.tradeDate}|${o.tradeTime}|${o.stockCode}|${o.themeId}`;
}
