export function parseOptionValue(raw: string | undefined | null): string[] {
    if (!raw) return [];
    return raw.split("|").map((t) => t.trim()).filter(Boolean);
}
