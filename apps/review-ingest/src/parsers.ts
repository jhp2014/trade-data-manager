const IDENTITY_COLUMNS = new Set([
  "tradeDate",
  "stockCode",
  "tradeTime",
  "line_TARGET",
  "_종목명",
  "_명령어 옵션",
]);

export function parseStockCode(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^'/, "");
}

export function parseLineTargets(raw: string | undefined): number[] {
  const value = (raw ?? "").trim();
  if (!value) return [];

  return value
    .split("|")
    .map((part) => Number(part.trim().replace(/,/g, "")))
    .filter((valuePart) => Number.isFinite(valuePart));
}

export function parseTradeTime(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}

export function collectPayload(row: Record<string, string>): Record<string, string | string[]> {
  const payload: Record<string, string | string[]> = {};

  for (const [key, raw] of Object.entries(row)) {
    if (IDENTITY_COLUMNS.has(key)) continue;
    const value = raw.trim();
    if (!value) continue;

    if (value.includes(" | ")) {
      const values = value
        .split(" | ")
        .map((part) => part.trim())
        .filter(Boolean);
      if (values.length > 0) payload[key] = values;
    } else {
      payload[key] = value;
    }
  }

  return payload;
}
