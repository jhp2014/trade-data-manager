import type { ThemeRowData } from "@/types/deck";
import type { ThemeMemberSlotFilter } from "@/types/filter";

export function matchThemeMemberSlot(row: ThemeRowData, c: ThemeMemberSlotFilter): boolean {
    if (c.countMin === null) return true;

    const all = [row.self, ...row.peers];
    const matchedCount = all.filter((m) => {
        const rate = m.closeRate;
        const amount =
            m.cumulativeAmount === null ? 0 : Number(m.cumulativeAmount) / 1e8;

        if (c.rateMin !== null && (rate === null || rate < c.rateMin)) return false;
        if (c.rateMax !== null && (rate === null || rate > c.rateMax)) return false;
        if (c.amountMin !== null && amount < c.amountMin) return false;
        return true;
    }).length;

    return matchedCount >= c.countMin;
}
