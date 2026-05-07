"use client";

import { useCallback, useMemo } from "react";
import {
    useQueryStates,
    parseAsInteger,
    parseAsFloat,
    parseAsString,
    parseAsArrayOf,
} from "nuqs";
import type { FilterState } from "@/types/filter";

export interface FilterChip {
    id: string;
    label: string;
}

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

type UrlParams = {
    [K in keyof typeof filterParsers]: ReturnType<typeof filterParsers[K]["parseServerSide"]>;
};

export function useFilterState() {
    const [params, setParams] = useQueryStates(filterParsers, { history: "replace" });

    const filter: FilterState = useMemo(
        () => ({
            themeSizeRange: { min: params.tsMin, max: params.tsMax },
            themeMemberSlot: {
                rateMin: params.tmRateMin,
                rateMax: params.tmRateMax,
                amountMin: params.tmAmtMin,
                countMin: params.tmCntMin,
            },
            stockCodes: params.codes ?? [],
            dateRange: { from: params.dFrom, to: params.dTo },
            timeRange: { from: params.tFrom, to: params.tTo },
            closeRateRange: { min: params.rateMin, max: params.rateMax },
            rankRange: { min: params.rankMin, max: params.rankMax },
            pullbackRange: { min: params.pbMin, max: params.pbMax },
            minutesSinceHighRange: { min: params.mshMin, max: params.mshMax },
            optionFilters: (params.opt ?? []).map((s) => {
                const idx = s.indexOf(":");
                return { key: s.slice(0, idx), needle: s.slice(idx + 1) };
            }),
        }),
        [params],
    );

    const setFilter = useCallback(
        (patch: Partial<FilterState>) => {
            const urlPatch: Partial<UrlParams> = {};
            if (patch.themeSizeRange !== undefined) {
                urlPatch.tsMin = patch.themeSizeRange.min;
                urlPatch.tsMax = patch.themeSizeRange.max;
            }
            if (patch.themeMemberSlot !== undefined) {
                urlPatch.tmRateMin = patch.themeMemberSlot.rateMin;
                urlPatch.tmRateMax = patch.themeMemberSlot.rateMax;
                urlPatch.tmAmtMin = patch.themeMemberSlot.amountMin;
                urlPatch.tmCntMin = patch.themeMemberSlot.countMin;
            }
            if (patch.stockCodes !== undefined) {
                urlPatch.codes = patch.stockCodes.length > 0 ? patch.stockCodes : null;
            }
            if (patch.dateRange !== undefined) {
                urlPatch.dFrom = patch.dateRange.from;
                urlPatch.dTo = patch.dateRange.to;
            }
            if (patch.timeRange !== undefined) {
                urlPatch.tFrom = patch.timeRange.from;
                urlPatch.tTo = patch.timeRange.to;
            }
            if (patch.closeRateRange !== undefined) {
                urlPatch.rateMin = patch.closeRateRange.min;
                urlPatch.rateMax = patch.closeRateRange.max;
            }
            if (patch.rankRange !== undefined) {
                urlPatch.rankMin = patch.rankRange.min;
                urlPatch.rankMax = patch.rankRange.max;
            }
            if (patch.pullbackRange !== undefined) {
                urlPatch.pbMin = patch.pullbackRange.min;
                urlPatch.pbMax = patch.pullbackRange.max;
            }
            if (patch.minutesSinceHighRange !== undefined) {
                urlPatch.mshMin = patch.minutesSinceHighRange.min;
                urlPatch.mshMax = patch.minutesSinceHighRange.max;
            }
            if (patch.optionFilters !== undefined) {
                urlPatch.opt =
                    patch.optionFilters.length > 0
                        ? patch.optionFilters.map((f) => `${f.key}:${f.needle}`)
                        : null;
            }
            setParams(urlPatch);
        },
        [setParams],
    );

    const clearFilter = useCallback(() => {
        setParams({
            tsMin: null, tsMax: null,
            tmRateMin: null, tmRateMax: null, tmAmtMin: null, tmCntMin: null,
            codes: null, dFrom: null, dTo: null, tFrom: null, tTo: null,
            rateMin: null, rateMax: null, rankMin: null, rankMax: null,
            pbMin: null, pbMax: null, mshMin: null, mshMax: null, opt: null,
        });
    }, [setParams]);

    const clearOne = useCallback(
        (chipId: string) => {
            if (chipId.startsWith("opt:")) {
                const raw = chipId.slice(4);
                const current = params.opt ?? [];
                setParams({ opt: current.filter((s) => s !== raw) || null });
            } else {
                setParams({ [chipId]: null } as Partial<UrlParams>);
            }
        },
        [params.opt, setParams],
    );

    const activeChips = useMemo(() => buildActiveChips(params), [params]);

    return { filter, setFilter, clearFilter, clearOne, activeChips };
}

function buildActiveChips(params: UrlParams): FilterChip[] {
    const chips: FilterChip[] = [];

    if (params.tsMin !== null) chips.push({ id: "tsMin", label: `테마종목 ≥ ${params.tsMin}` });
    if (params.tsMax !== null) chips.push({ id: "tsMax", label: `테마종목 ≤ ${params.tsMax}` });

    if (params.tmCntMin !== null) {
        const parts: string[] = [];
        if (params.tmRateMin !== null) parts.push(`등락률 ≥ ${params.tmRateMin}%`);
        if (params.tmRateMax !== null) parts.push(`등락률 ≤ ${params.tmRateMax}%`);
        if (params.tmAmtMin !== null) parts.push(`대금 ≥ ${params.tmAmtMin}억`);
        chips.push({
            id: "tmCntMin",
            label: `활성종목 ${parts.length > 0 ? `[${parts.join(", ")}] ` : ""}≥ ${params.tmCntMin}개`,
        });
    } else {
        if (params.tmRateMin !== null) chips.push({ id: "tmRateMin", label: `슬롯등락률 ≥ ${params.tmRateMin}%` });
        if (params.tmRateMax !== null) chips.push({ id: "tmRateMax", label: `슬롯등락률 ≤ ${params.tmRateMax}%` });
        if (params.tmAmtMin !== null) chips.push({ id: "tmAmtMin", label: `슬롯대금 ≥ ${params.tmAmtMin}억` });
    }

    if (params.codes && params.codes.length > 0)
        chips.push({ id: "codes", label: `종목코드: ${params.codes.join(", ")}` });

    if (params.dFrom !== null) chips.push({ id: "dFrom", label: `날짜 ≥ ${params.dFrom}` });
    if (params.dTo !== null) chips.push({ id: "dTo", label: `날짜 ≤ ${params.dTo}` });
    if (params.tFrom !== null) chips.push({ id: "tFrom", label: `시간 ≥ ${params.tFrom}` });
    if (params.tTo !== null) chips.push({ id: "tTo", label: `시간 ≤ ${params.tTo}` });

    if (params.rateMin !== null) chips.push({ id: "rateMin", label: `등락률 ≥ ${params.rateMin}%` });
    if (params.rateMax !== null) chips.push({ id: "rateMax", label: `등락률 ≤ ${params.rateMax}%` });
    if (params.rankMin !== null) chips.push({ id: "rankMin", label: `등수 ≥ ${params.rankMin}` });
    if (params.rankMax !== null) chips.push({ id: "rankMax", label: `등수 ≤ ${params.rankMax}` });
    if (params.pbMin !== null) chips.push({ id: "pbMin", label: `풀백 ≥ ${params.pbMin}%` });
    if (params.pbMax !== null) chips.push({ id: "pbMax", label: `풀백 ≤ ${params.pbMax}%` });
    if (params.mshMin !== null) chips.push({ id: "mshMin", label: `고점경과 ≥ ${params.mshMin}분` });
    if (params.mshMax !== null) chips.push({ id: "mshMax", label: `고점경과 ≤ ${params.mshMax}분` });

    for (const raw of params.opt ?? []) {
        const idx = raw.indexOf(":");
        const key = raw.slice(0, idx);
        const needle = raw.slice(idx + 1);
        chips.push({ id: `opt:${raw}`, label: `${key}=${needle}` });
    }

    return chips;
}
