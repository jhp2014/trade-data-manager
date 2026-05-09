"use client";

import { DateRangeInput } from "@/components/filter/inputs/DateRangeInput";
import type { FilterKind } from "./types";

type DateRangeValue = { from: string | null; to: string | null };

export const dateRangeKind: FilterKind<DateRangeValue> = {
    kind: "dateRange",
    label: "날짜 범위",
    section: "target",
    multiple: false,
    defaultValue: () => ({ from: null, to: null }),
    chipLabel: (v) => {
        if (v.from && v.to) return `날짜 ${v.from}~${v.to}`;
        if (v.from) return `날짜 ≥${v.from}`;
        if (v.to) return `날짜 ≤${v.to}`;
        return "날짜";
    },
    match: (row, v) => {
        const d = row.entry.tradeDate;
        if (v.from !== null && d < v.from) return false;
        if (v.to !== null && d > v.to) return false;
        return true;
    },
    Input: ({ value, onChange }) => <DateRangeInput value={value} onChange={onChange} />,
    // 직렬화: "<from>|<to>" (빈 값은 빈 문자열)
    serialize: (v) => `${v.from ?? ""}|${v.to ?? ""}`,
    deserialize: (raw) => {
        const pipeIdx = raw.indexOf("|");
        if (pipeIdx === -1) return null;
        const from = raw.slice(0, pipeIdx) || null;
        const to = raw.slice(pipeIdx + 1) || null;
        return { from, to };
    },
};
