import type {
    DailyTag,
    Opportunity,
    TagScope,
    TagTree,
} from "./types";
import {
    makeStockDateKey,
    makeThemeDateKey,
} from "./types";
import { hasAnyPrefix, hasExact, matchesPrefix } from "./tree-utils";

/* ===========================================================
 * 필터 타입
 * =========================================================== */

export interface TagFilter {
    /** 정확히 일치하는 태그가 하나라도 있어야 함 */
    hasAny?: string[];
    /** prefix 매칭이 하나라도 있어야 함 */
    hasAnyPrefix?: string[];
    /** 모든 태그가 정확히 매칭되어야 함 */
    hasAll?: string[];
    /** 이 태그가 절대 없어야 함 */
    notHas?: string[];
    /** prefix 매칭이 없어야 함 */
    notHasPrefix?: string[];
}

export interface OpportunityFilter {
    fromDate?: string;
    toDate?: string;
    fromTime?: string;
    toTime?: string;
    stockCodes?: string[];
    themeIds?: bigint[];
    /** 일봉 태그 조건 (해당 마킹의 (stockCode, tradeDate) 일봉 태그) */
    dailyTags?: TagFilter;
    /** 의견 태그 조건 (마킹 자체의 tags) */
    opinionTags?: TagFilter;
}

/* ===========================================================
 * UserData
 *
 * 모든 사용자 데이터를 메모리에 인덱싱하고 검색 API를 제공.
 * 인스턴스는 보통 앱 시작 시 한 번 만들어 재사용.
 * =========================================================== */

export class UserData {
    private readonly dailyByStockDate: Map<string, DailyTag>;
    private readonly oppByStockDate: Map<string, Opportunity[]>;
    private readonly oppByThemeDate: Map<string, Opportunity[]>;

    constructor(
        private readonly trees: { daily: TagTree; opinion: TagTree },
        private readonly dailyList: DailyTag[],
        private readonly oppList: Opportunity[]
    ) {
        this.dailyByStockDate = buildDailyIndex(dailyList);
        this.oppByStockDate = buildOppIndexByStockDate(oppList);
        this.oppByThemeDate = buildOppIndexByThemeDate(oppList);
    }

    /* ============ 기본 조회 ============ */

    getOpportunities(): readonly Opportunity[] {
        return this.oppList;
    }

    getDailyTagList(): readonly DailyTag[] {
        return this.dailyList;
    }

    getDailyTags(stockCode: string, tradeDate: string): readonly string[] {
        return (
            this.dailyByStockDate.get(makeStockDateKey(stockCode, tradeDate))
                ?.tags ?? []
        );
    }

    getOpportunitiesByStockDate(
        stockCode: string,
        tradeDate: string
    ): readonly Opportunity[] {
        return (
            this.oppByStockDate.get(makeStockDateKey(stockCode, tradeDate)) ?? []
        );
    }

    getOpportunitiesByThemeDate(
        themeId: bigint,
        tradeDate: string
    ): readonly Opportunity[] {
        return (
            this.oppByThemeDate.get(makeThemeDateKey(themeId, tradeDate)) ?? []
        );
    }

    /* ============ 태그 트리 (UI용) ============ */

    getTagTree(scope: TagScope): TagTree {
        return scope === "daily" ? this.trees.daily : this.trees.opinion;
    }

    /* ============ 모든 태그 결합 (일봉 + 의견) ============ */

    getAllTags(opp: Opportunity): {
        daily: readonly string[];
        opinion: readonly string[];
    } {
        return {
            daily: this.getDailyTags(opp.stockCode, opp.tradeDate),
            opinion: opp.tags,
        };
    }

    /* ============ 필터링 ============ */

    filterOpportunities(filter: OpportunityFilter): Opportunity[] {
        return this.oppList.filter((opp) => this.matchesFilter(opp, filter));
    }

    private matchesFilter(opp: Opportunity, f: OpportunityFilter): boolean {
        if (f.fromDate && opp.tradeDate < f.fromDate) return false;
        if (f.toDate && opp.tradeDate > f.toDate) return false;
        if (f.fromTime && opp.tradeTime < f.fromTime) return false;
        if (f.toTime && opp.tradeTime > f.toTime) return false;
        if (f.stockCodes && !f.stockCodes.includes(opp.stockCode)) return false;
        if (f.themeIds && !f.themeIds.includes(opp.themeId)) return false;

        if (f.opinionTags && !matchTagFilter(opp.tags, f.opinionTags))
            return false;

        if (f.dailyTags) {
            const dailyTags = this.getDailyTags(opp.stockCode, opp.tradeDate);
            if (!matchTagFilter(dailyTags, f.dailyTags)) return false;
        }

        return true;
    }

    /* ============ 분봉 features 조회용 키 추출 ============ */

    extractThemeDatePairs(
        opps?: readonly Opportunity[]
    ): Array<{ themeId: bigint; tradeDate: string }> {
        const source = opps ?? this.oppList;
        const seen = new Set<string>();
        const result: Array<{ themeId: bigint; tradeDate: string }> = [];
        for (const o of source) {
            const key = makeThemeDateKey(o.themeId, o.tradeDate);
            if (!seen.has(key)) {
                seen.add(key);
                result.push({ themeId: o.themeId, tradeDate: o.tradeDate });
            }
        }
        return result;
    }

    extractStockDatePairs(
        opps?: readonly Opportunity[]
    ): Array<{ stockCode: string; tradeDate: string }> {
        const source = opps ?? this.oppList;
        const seen = new Set<string>();
        const result: Array<{ stockCode: string; tradeDate: string }> = [];
        for (const o of source) {
            const key = makeStockDateKey(o.stockCode, o.tradeDate);
            if (!seen.has(key)) {
                seen.add(key);
                result.push({ stockCode: o.stockCode, tradeDate: o.tradeDate });
            }
        }
        return result;
    }
}

/* ===========================================================
 * 인덱스 빌더
 * =========================================================== */

function buildDailyIndex(list: DailyTag[]): Map<string, DailyTag> {
    const m = new Map<string, DailyTag>();
    for (const r of list) {
        m.set(makeStockDateKey(r.stockCode, r.tradeDate), r);
    }
    return m;
}

function buildOppIndexByStockDate(
    list: Opportunity[]
): Map<string, Opportunity[]> {
    const m = new Map<string, Opportunity[]>();
    for (const o of list) {
        const k = makeStockDateKey(o.stockCode, o.tradeDate);
        const arr = m.get(k);
        if (arr) arr.push(o);
        else m.set(k, [o]);
    }
    return m;
}

function buildOppIndexByThemeDate(
    list: Opportunity[]
): Map<string, Opportunity[]> {
    const m = new Map<string, Opportunity[]>();
    for (const o of list) {
        const k = makeThemeDateKey(o.themeId, o.tradeDate);
        const arr = m.get(k);
        if (arr) arr.push(o);
        else m.set(k, [o]);
    }
    return m;
}

/* ===========================================================
 * 태그 필터 매칭
 * =========================================================== */

function matchTagFilter(
    tags: readonly string[],
    f: TagFilter
): boolean {
    if (f.hasAny && f.hasAny.length > 0) {
        if (!f.hasAny.some((t) => hasExact(tags, t))) return false;
    }
    if (f.hasAnyPrefix && f.hasAnyPrefix.length > 0) {
        if (!f.hasAnyPrefix.some((p) => hasAnyPrefix(tags, p))) return false;
    }
    if (f.hasAll && f.hasAll.length > 0) {
        if (!f.hasAll.every((t) => hasExact(tags, t))) return false;
    }
    if (f.notHas && f.notHas.length > 0) {
        if (f.notHas.some((t) => hasExact(tags, t))) return false;
    }
    if (f.notHasPrefix && f.notHasPrefix.length > 0) {
        if (
            f.notHasPrefix.some((p) =>
                tags.some((t) => matchesPrefix(t, p))
            )
        )
            return false;
    }
    return true;
}
