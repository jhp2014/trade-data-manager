import type { ManualSummary } from "@/types/review";

const PREVIEW_KEYS = ["entryType", "reason", "memo", "reviewDone"];

export function buildManualSummary(manual: Record<string, string>): ManualSummary {
  const entries = Object.entries(manual);
  const filledKeys = entries
    .filter(([, value]) => value.trim().length > 0)
    .map(([key]) => key);

  const preview = PREVIEW_KEYS.reduce<Record<string, string | null>>((acc, key) => {
    const value = manual[key]?.trim();
    acc[key] = value ? value : null;
    return acc;
  }, {});

  return {
    filledCount: filledKeys.length,
    totalCount: entries.length,
    missingRequired: entries.filter(([key, value]) => !value.trim()).map(([key]) => key),
    preview,
  };
}
