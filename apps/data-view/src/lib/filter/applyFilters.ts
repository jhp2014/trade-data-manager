/**
 * 전체 필터를 순서대로 적용해 조건을 만족하는 행만 반환한다.
 * In: ThemeRowData[], filterValues(레지스트리), optionFilters(동적)  Out: 필터링된 ThemeRowData[]
 * See: lib/filter/registry/index.ts (등록 배열), hooks/useFilterState.ts (URL ↔ 상태)
 */
import type { ThemeRowData } from "@/types/deck";
import type { OptionFilter } from "@/types/filter";
import { FILTERS } from "./registry";
import { matchOption } from "./matchers/option";

export function applyFilters(
    rows: ThemeRowData[],
    filterValues: Record<string, unknown>,
    optionFilters: OptionFilter[],
): ThemeRowData[] {
    return rows.filter((row) => {
        for (const f of FILTERS) {
            if (!f.match(row, filterValues[f.id])) return false;
        }
        for (const opt of optionFilters) {
            if (!matchOption(row, opt)) return false;
        }
        return true;
    });
}
