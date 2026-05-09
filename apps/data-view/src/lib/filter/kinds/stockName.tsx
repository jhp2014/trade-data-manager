"use client";

import { TextMultiInput } from "@/components/filter/inputs/TextMultiInput";
import type { FilterKind } from "./types";

export const stockNameKind: FilterKind<string[]> = {
    kind: "stockName",
    label: "종목명",
    section: "target",
    multiple: false,
    defaultValue: () => [],
    chipLabel: (v) => v.length === 0 ? "" : `종목명: ${v.join(", ")}`,
    match: (row, v) => {
        if (v.length === 0) return true;
        const name = row.self.stockName.toLowerCase();
        return v.some((q) => name.includes(q.toLowerCase()));
    },
    Input: ({ value, onChange }) => (
        <TextMultiInput
            label="종목명"
            values={value}
            onChange={onChange}
            placeholder="예: 삼성전자, LG"
        />
    ),
    serialize: (v) => v.join(","),
    deserialize: (raw) => {
        if (!raw) return [];
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
    },
};
