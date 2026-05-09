"use client";

import { TextMultiInput } from "@/components/filter/inputs/TextMultiInput";
import type { FilterKind } from "./types";

export const stockCodeKind: FilterKind<string[]> = {
    kind: "stockCode",
    label: "종목 코드",
    section: "target",
    multiple: false,
    defaultValue: () => [],
    chipLabel: (v) => `종목코드: ${v.join(", ")}`,
    match: (row, v) => v.length === 0 || v.includes(row.entry.stockCode),
    Input: ({ value, onChange }) => (
        <TextMultiInput
            label="종목 코드"
            values={value}
            onChange={onChange}
            placeholder="예: 005930, 000660"
        />
    ),
    // 직렬화: 쉼표로 join
    serialize: (v) => v.join(","),
    deserialize: (raw) => {
        if (!raw) return [];
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
    },
};
