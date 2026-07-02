// 카드 버킷팅 — market-eye src/renderer/grouping.ts 이식(순수). 외부 import 0.
// ≥2 멤버 테마 = 카드 / 어느 ≥2 테마에도 못 든 종목 = 개별(테마 있음)·미분류(테마 없음).

export interface Groupable {
    code: string;
    themes: string[];
    changeRate: number;
    isMover: boolean;
    amount: number; // 거래대금(정렬 tie-break)
}

export interface ThemeGroup<T> {
    theme: string;
    stocks: T[]; // 등락률 desc(byTheme 로스터 순서)
}

export interface Grouped<T> {
    themes: ThemeGroup<T>[]; // hot 멤버 2+ 테마, 정렬순
    individuals: T[]; // 어느 ≥2 테마에도 못 든 종목(테마 있음)
    unclassified: T[]; // 테마 없음
}

const sumAmount = <T extends Groupable>(s: T[]): number => s.reduce((n, x) => n + x.amount, 0);
const moverCount = <T extends Groupable>(g: ThemeGroup<T>): number => g.stocks.filter((s) => s.isMover).length;

/** 카드 정렬 — 주도주 수 → 전체 수 → 거래대금 합 → 이름. */
export function themeCompare<T extends Groupable>(a: ThemeGroup<T>, b: ThemeGroup<T>): number {
    return (
        moverCount(b) - moverCount(a) ||
        b.stocks.length - a.stocks.length ||
        sumAmount(b.stocks) - sumAmount(a.stocks) ||
        a.theme.localeCompare(b.theme, "ko")
    );
}

/**
 * 중복 허용 그룹핑(byTheme 로스터 입력):
 *  - hot 멤버 2+ 테마는 전부 카드(한 종목이 여러 카드에 중복 가능).
 *  - 어느 ≥2 테마에도 못 든 종목 → 테마 있으면 개별, 없으면 미분류(등락률 desc).
 */
export function groupStocks<T extends Groupable>(byTheme: Map<string, T[]>, all: readonly T[]): Grouped<T> {
    const themes: ThemeGroup<T>[] = [];
    for (const [theme, list] of byTheme) if (list.length >= 2) themes.push({ theme, stocks: list });
    themes.sort(themeCompare);

    const carded = new Set<string>();
    for (const g of themes) for (const s of g.stocks) carded.add(s.code);

    const individuals: T[] = [];
    const unclassified: T[] = [];
    for (const s of all) {
        if (carded.has(s.code)) continue;
        (s.themes.length > 0 ? individuals : unclassified).push(s);
    }
    individuals.sort((a, b) => b.changeRate - a.changeRate);
    unclassified.sort((a, b) => b.changeRate - a.changeRate);

    return { themes, individuals, unclassified };
}
