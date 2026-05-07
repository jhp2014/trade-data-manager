import type { FilterDefinition } from "./types";
import { TextMultiInput } from "@/components/filter/inputs/TextMultiInput";
import { matchStockCode } from "../matchers/stockCode";

export const stockCodeFilter: FilterDefinition<string[]> = {
    id: "stockCode",
    label: "종목 코드",
    section: "target",
    defaultValue: [],

    fromUrl: (p) => p.codes ?? [],
    toUrl: (v) => ({ codes: v.length > 0 ? v : null }),

    chips: (v) =>
        v.length > 0 ? [{ id: "codes", label: `종목코드: ${v.join(", ")}` }] : [],
    clearChip: (_chipId, _current) => [],

    match: (row, v) => matchStockCode(row, v),

    Input: ({ value, onChange }) => (
        <TextMultiInput
            label="종목 코드"
            values={value}
            onChange={onChange}
            placeholder="예: 005930, 000660"
        />
    ),
};
