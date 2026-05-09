"use client";

import { OptionRow } from "@/components/filter/inputs/OptionRow";
import { parseOptionValue } from "@/lib/options/parseOptionValue";
import type { FilterKind, BuildCtx } from "./types";
import type { OptionMeta } from "@/lib/options/optionRegistry";
import styles from "@/components/filter/inputs.module.css";

export interface OptionValue {
    key: string;
    mode: "anyOf" | "contains";
    values?: string[];
    needle?: string;
}

function OptionKindInput({
    value,
    onChange,
    ctx,
}: {
    value: OptionValue;
    onChange: (v: OptionValue) => void;
    ctx: BuildCtx;
}) {
    const meta: OptionMeta = ctx.optionRegistry.get(value.key) ?? {
        key: value.key,
        values: [],
        defaultMode: "contains",
        isMultiToken: false,
    };

    const handleKeyChange = (newKey: string) => {
        const newMeta = ctx.optionRegistry.get(newKey);
        const newMode = newMeta?.defaultMode ?? "anyOf";
        onChange({ key: newKey, mode: newMode, values: [], needle: "" });
    };

    return (
        <div>
            {ctx.optionKeys.length > 1 && (
                <div className={styles.row}>
                    <label className={styles.label}>옵션 키</label>
                    <select
                        className={styles.input}
                        value={value.key}
                        onChange={(e) => handleKeyChange(e.target.value)}
                    >
                        {ctx.optionKeys.map((k) => (
                            <option key={k} value={k}>{k}</option>
                        ))}
                    </select>
                </div>
            )}
            <OptionRow
                optionKey={value.key}
                meta={meta}
                value={value}
                onChange={onChange}
            />
        </div>
    );
}

export const optionKind: FilterKind<OptionValue> = {
    kind: "option",
    label: "옵션 필터",
    section: "option",
    multiple: true,
    defaultValue: (ctx) => ({
        key: ctx.optionKeys[0] ?? "",
        mode: "anyOf",
        values: [],
    }),
    chipLabel: (v) => {
        if (v.mode === "anyOf") {
            const vals = v.values ?? [];
            return vals.length > 0 ? `${v.key} ∈ {${vals.join(", ")}}` : `${v.key} (선택 없음)`;
        }
        return `${v.key} ⊃ "${v.needle ?? ""}"`;
    },
    match: (row, v) => {
        const raw = row.entry.options[v.key];
        if (!raw) return false;
        if (v.mode === "anyOf") {
            const vals = v.values ?? [];
            if (vals.length === 0) return true;
            const tokens = parseOptionValue(raw);
            return vals.some((x) => tokens.includes(x));
        }
        const needle = (v.needle ?? "").trim();
        if (!needle) return true;
        return raw.toLowerCase().includes(needle.toLowerCase());
    },
    Input: OptionKindInput,
    // 직렬화: "<key>|<mode>|<payload>" (anyOf: values joined by |, contains: needle)
    serialize: (v) => {
        if (v.mode === "anyOf") {
            return `${v.key}|anyOf|${(v.values ?? []).join("|")}`;
        }
        return `${v.key}|contains|${v.needle ?? ""}`;
    },
    deserialize: (raw) => {
        const parts = raw.split("|");
        if (parts.length < 2) return null;
        const key = parts[0];
        const mode = parts[1] as "anyOf" | "contains";
        if (mode !== "anyOf" && mode !== "contains") return null;
        if (!key) return null;
        if (mode === "anyOf") {
            const values = parts.slice(2).filter(Boolean);
            return { key, mode, values };
        }
        return { key, mode, needle: parts.slice(2).join("|") };
    },
};
