import type { ThemeMemberSlotFilter } from "@/types/filter";
import type { FilterDefinition } from "./types";
import { ThemeMemberSlotInput } from "@/components/filter/inputs/ThemeMemberSlotInput";
import { matchThemeMemberSlot } from "../matchers/themeMemberSlot";

export const themeMemberSlotFilter: FilterDefinition<ThemeMemberSlotFilter> = {
    id: "themeMemberSlot",
    label: "슬롯 조건",
    section: "theme",
    defaultValue: { rateMin: null, rateMax: null, amountMin: null, countMin: null },

    fromUrl: (p) => ({
        rateMin: p.tmRateMin,
        rateMax: p.tmRateMax,
        amountMin: p.tmAmtMin,
        countMin: p.tmCntMin,
    }),
    toUrl: (v) => ({
        tmRateMin: v.rateMin,
        tmRateMax: v.rateMax,
        tmAmtMin: v.amountMin,
        tmCntMin: v.countMin,
    }),

    chips: (v) => {
        if (v.countMin !== null) {
            const parts: string[] = [];
            if (v.rateMin !== null) parts.push(`등락률 ≥ ${v.rateMin}%`);
            if (v.rateMax !== null) parts.push(`등락률 ≤ ${v.rateMax}%`);
            if (v.amountMin !== null) parts.push(`대금 ≥ ${v.amountMin}억`);
            return [{
                id: "tmCntMin",
                label: `활성종목 ${parts.length > 0 ? `[${parts.join(", ")}] ` : ""}≥ ${v.countMin}개`,
            }];
        }
        const result = [];
        if (v.rateMin !== null) result.push({ id: "tmRateMin", label: `슬롯등락률 ≥ ${v.rateMin}%` });
        if (v.rateMax !== null) result.push({ id: "tmRateMax", label: `슬롯등락률 ≤ ${v.rateMax}%` });
        if (v.amountMin !== null) result.push({ id: "tmAmtMin", label: `슬롯대금 ≥ ${v.amountMin}억` });
        return result;
    },
    clearChip: (chipId, current) => {
        if (chipId === "tmCntMin") return { ...current, countMin: null };
        if (chipId === "tmRateMin") return { ...current, rateMin: null };
        if (chipId === "tmRateMax") return { ...current, rateMax: null };
        if (chipId === "tmAmtMin") return { ...current, amountMin: null };
        return current;
    },

    match: (row, v) => matchThemeMemberSlot(row, v),

    Input: ThemeMemberSlotInput,
};
