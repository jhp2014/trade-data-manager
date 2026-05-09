"use client";

import { TimeRangeInput } from "@/components/filter/inputs/TimeRangeInput";
import type { FilterKind } from "./types";

type TimeRangeValue = { from: string | null; to: string | null };

export const timeRangeKind: FilterKind<TimeRangeValue> = {
    kind: "timeRange",
    label: "시간 범위",
    section: "target",
    multiple: false,
    defaultValue: () => ({ from: null, to: null }),
    chipLabel: (v) => {
        const fmt = (t: string) => t.slice(0, 5);
        if (v.from && v.to) return `시간 ${fmt(v.from)}~${fmt(v.to)}`;
        if (v.from) return `시간 ≥${fmt(v.from)}`;
        if (v.to) return `시간 ≤${fmt(v.to)}`;
        return "시간";
    },
    match: (row, v) => {
        const t = row.entry.tradeTime;
        if (v.from !== null && t < v.from) return false;
        if (v.to !== null && t > v.to) return false;
        return true;
    },
    Input: ({ value, onChange }) => <TimeRangeInput value={value} onChange={onChange} />,
    // 직렬화: "<from>|<to>"
    serialize: (v) => `${v.from ?? ""}|${v.to ?? ""}`,
    deserialize: (raw) => {
        const pipeIdx = raw.indexOf("|");
        if (pipeIdx === -1) return null;
        const from = raw.slice(0, pipeIdx) || null;
        const to = raw.slice(pipeIdx + 1) || null;
        return { from, to };
    },
};
