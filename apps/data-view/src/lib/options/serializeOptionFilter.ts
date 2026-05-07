import type { OptionFilter } from "@/types/filter";

export function serializeOptionFilter(f: OptionFilter): string {
    if (f.mode === "anyOf") {
        return `any:${f.key}:${f.values.join("|")}`;
    }
    return `has:${f.key}:${f.needle}`;
}

export function deserializeOptionFilter(raw: string): OptionFilter | null {
    const firstColon = raw.indexOf(":");
    if (firstColon === -1) return null;

    const tag = raw.slice(0, firstColon);
    const rest = raw.slice(firstColon + 1);
    const secondColon = rest.indexOf(":");
    if (secondColon === -1) return null;

    const key = rest.slice(0, secondColon);
    const payload = rest.slice(secondColon + 1);

    if (tag === "any") {
        const values = payload.split("|").map((v) => v.trim()).filter(Boolean);
        if (values.length === 0) return null;
        return { mode: "anyOf", key, values };
    }

    if (tag === "has") {
        if (!payload) return null;
        return { mode: "contains", key, needle: payload };
    }

    return null;
}

export function chipLabelForOptionFilter(f: OptionFilter): string {
    if (f.mode === "anyOf") {
        return `${f.key} ∈ {${f.values.join(", ")}}`;
    }
    return `${f.key} ⊃ "${f.needle}"`;
}
