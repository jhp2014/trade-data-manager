export function formatPercent(v: number, digits = 2): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

/** 100억 → "100억", 1조 5천억 → "1.5조" 식의 한국식 표기 */
export function formatKrwShort(v: number): string {
  if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(0)}억`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return v.toLocaleString();
}

export function formatInt(v: number): string {
  return v.toLocaleString();
}

export function riseFallClass(v: number): "rise" | "fall" | "neutral" {
  if (v > 0) return "rise";
  if (v < 0) return "fall";
  return "neutral";
}
