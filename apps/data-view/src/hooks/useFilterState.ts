"use client";

import { useCallback, useMemo } from "react";
import {
    useQueryStates,
    parseAsInteger,
    parseAsFloat,
    parseAsString,
    parseAsArrayOf,
} from "nuqs";
import type { OptionFilter } from "@/types/filter";
import { FILTERS } from "@/lib/filter/registry";
import type { FilterChip } from "@/lib/filter/registry";
import type { FilterUrlParams } from "@/lib/filter/registry";
import {
    serializeOptionFilter,
    deserializeOptionFilter,
    chipLabelForOptionFilter,
} from "@/lib/options/serializeOptionFilter";

// nuqs 파서 정의 — FilterUrlParams의 각 키에 대응
const filterParsers = {
    tsMin: parseAsInteger,
    tsMax: parseAsInteger,
    tmRateMin: parseAsFloat,
    tmRateMax: parseAsFloat,
    tmAmtMin: parseAsFloat,
    tmCntMin: parseAsInteger,
    codes: parseAsArrayOf(parseAsString),
    dFrom: parseAsString,
    dTo: parseAsString,
    tFrom: parseAsString,
    tTo: parseAsString,
    rateMin: parseAsFloat,
    rateMax: parseAsFloat,
    rankMin: parseAsInteger,
    rankMax: parseAsInteger,
    pbMin: parseAsFloat,
    pbMax: parseAsFloat,
    mshMin: parseAsInteger,
    mshMax: parseAsInteger,
    opt: parseAsArrayOf(parseAsString),
};

export function useFilterState() {
    const [params, setParams] = useQueryStates(filterParsers, { history: "replace" });

    // 각 필터 정의가 자신의 URL 파라미터에서 값을 추출
    const filterValues: Record<string, unknown> = useMemo(() => {
        const result: Record<string, unknown> = {};
        for (const f of FILTERS) {
            result[f.id] = f.fromUrl(params as FilterUrlParams);
        }
        return result;
    }, [params]);

    // 옵션 필터 (동적 키 — 레지스트리 외부에서 별도 관리)
    const optionFilters: OptionFilter[] = useMemo(
        () =>
            (params.opt ?? [])
                .map(deserializeOptionFilter)
                .filter((f): f is OptionFilter => f !== null),
        [params],
    );

    const setFilterValue = useCallback(
        (filterId: string, value: unknown) => {
            const f = FILTERS.find((x) => x.id === filterId);
            if (!f) return;
            setParams(f.toUrl(value) as Partial<FilterUrlParams>);
        },
        [setParams],
    );

    const setOptionFilters = useCallback(
        (filters: OptionFilter[]) => {
            setParams({ opt: filters.length > 0 ? filters.map(serializeOptionFilter) : null });
        },
        [setParams],
    );

    const clearAll = useCallback(() => {
        const patch: Record<string, null> = {};
        for (const key of Object.keys(filterParsers)) {
            patch[key] = null;
        }
        setParams(patch as Partial<FilterUrlParams>);
    }, [setParams]);

    const clearOne = useCallback(
        (chipId: string) => {
            if (chipId.startsWith("opt:")) {
                const raw = chipId.slice(4);
                const current = params.opt ?? [];
                const next = current.filter((s) => s !== raw);
                setParams({ opt: next.length > 0 ? next : null });
                return;
            }
            // 어느 필터가 이 칩을 소유하는지 찾아 해당 필터 값만 업데이트
            for (const f of FILTERS) {
                const value = f.fromUrl(params as FilterUrlParams);
                const chips = f.chips(value);
                if (chips.some((c) => c.id === chipId)) {
                    const next = f.clearChip(chipId, value);
                    setParams(f.toUrl(next) as Partial<FilterUrlParams>);
                    return;
                }
            }
        },
        [params, setParams],
    );

    const activeChips: FilterChip[] = useMemo(() => {
        const chips: FilterChip[] = [];
        for (const f of FILTERS) {
            chips.push(...f.chips(f.fromUrl(params as FilterUrlParams)));
        }
        for (const raw of params.opt ?? []) {
            const f = deserializeOptionFilter(raw);
            if (!f) continue;
            chips.push({ id: `opt:${raw}`, label: chipLabelForOptionFilter(f) });
        }
        return chips;
    }, [params]);

    return {
        filterValues,
        optionFilters,
        setFilterValue,
        setOptionFilters,
        clearAll,
        clearOne,
        activeChips,
    };
}
