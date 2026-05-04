export function formatPercent(v: number | null, digits = 2): string {
  if (v === null) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

export function formatKrwShort(v: number | bigint | string | null): string {
  if (v === null) return "-";
  const n = typeof v === "bigint" ? Number(v) : typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(0)}억`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return n.toLocaleString();
}

export function formatInt(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString();
}

export function riseFallClass(v: number | null): "rise" | "fall" | "neutral" {
  if (v === null) return "neutral";
  if (v > 0) return "rise";
  if (v < 0) return "fall";
  return "neutral";
}
