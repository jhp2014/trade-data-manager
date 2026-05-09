// See: lib/filter/derived.ts (derivedMap 계산), lib/filter/kinds/index.ts (KINDS 레지스트리)
import type { ThemeRowData } from "@/types/deck";
import type { FilterInstance, RowDerived, FilterKind } from "./kinds/types";
import { rowKey } from "./derived";

const EMPTY_DERIVED: RowDerived = { activePools: [] };

export function applyFiltersNew(
    rows: ThemeRowData[],
    instances: FilterInstance[],
    derivedMap: Map<string, RowDerived>,
    kinds: Record<string, FilterKind<any>>, // any: 다형 레지스트리
): ThemeRowData[] {
    if (instances.length === 0) return rows;
    return rows.filter((row) => {
        const derived = derivedMap.get(rowKey(row)) ?? EMPTY_DERIVED;
        return instances.every((inst) => {
            const kind = kinds[inst.kind];
            if (!kind) return true;
            return kind.match(row, inst.value, derived, inst.id);
        });
    });
}
