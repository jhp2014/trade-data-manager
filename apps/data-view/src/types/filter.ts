export interface RangeFilter {
    min: number | null;
    max: number | null;
}

export interface ThemeMemberSlotFilter {
    rateMin: number | null;
    rateMax: number | null;
    amountMin: number | null; // 단위: 억
    countMin: number | null;
}

export type OptionFilter =
    | { key: string; mode: "anyOf"; values: string[] }
    | { key: string; mode: "contains"; needle: string };

export interface FilterState {
    // ── 테마 단위 ──
    themeSizeRange: RangeFilter;
    themeMemberSlot: ThemeMemberSlotFilter;
    // ── Target 종목 단위 ──
    stockCodes: string[];
    dateRange: { from: string | null; to: string | null };
    timeRange: { from: string | null; to: string | null };
    closeRateRange: RangeFilter;
    rankRange: RangeFilter;
    pullbackRange: RangeFilter;
    minutesSinceHighRange: RangeFilter;
    // ── 동적 ──
    optionFilters: OptionFilter[];
}

export const EMPTY_FILTER: FilterState = {
    themeSizeRange: { min: null, max: null },
    themeMemberSlot: { rateMin: null, rateMax: null, amountMin: null, countMin: null },
    stockCodes: [],
    dateRange: { from: null, to: null },
    timeRange: { from: null, to: null },
    closeRateRange: { min: null, max: null },
    rankRange: { min: null, max: null },
    pullbackRange: { min: null, max: null },
    minutesSinceHighRange: { min: null, max: null },
    optionFilters: [],
};
