import type { ReviewRow } from "@/types/review";

const FIXED_COLUMNS = new Set([
  "reviewId",
  "stockCode",
  "stockName",
  "tradeDate",
  "tradeTime",
]);

const REQUIRED_COLUMNS = ["stockCode", "tradeDate"] as const;

export function parseSheetValues(values: string[][]): ReviewRow[] {
  if (values.length === 0) return [];

  const headers = values[0].map((header) => header.trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  for (const column of REQUIRED_COLUMNS) {
    if (!headerIndex.has(column)) {
      throw new Error(`[sheet] required column missing: ${column}`);
    }
  }

  const rows: ReviewRow[] = [];
  for (let index = 1; index < values.length; index++) {
    const row = values[index] ?? [];
    if (isBlankRow(row)) continue;

    const rowNumber = index + 1;
    const stockCode = getCell(row, headerIndex, "stockCode");
    const tradeDate = normalizeTradeDate(getCell(row, headerIndex, "tradeDate"));

    if (!stockCode || !tradeDate) {
      console.warn(`[sheet] skip row ${rowNumber}: stockCode/tradeDate is required`);
      continue;
    }

    const manual: Record<string, string> = {};
    const features: Record<string, string> = {};

    for (const [column, columnIndex] of headerIndex.entries()) {
      if (!column) continue;
      const value = row[columnIndex]?.trim() ?? "";
      if (column.startsWith("m_")) {
        manual[column.slice(2)] = value;
        continue;
      }
      if (!FIXED_COLUMNS.has(column)) {
        features[column] = value;
      }
    }

    rows.push({
      reviewId: getCell(row, headerIndex, "reviewId"),
      rowNumber,
      stockCode,
      stockName: getCell(row, headerIndex, "stockName") || undefined,
      tradeDate,
      tradeTime: normalizeTradeTime(getCell(row, headerIndex, "tradeTime")),
      features,
      manual,
    });
  }

  return rows;
}

function getCell(row: string[], headerIndex: Map<string, number>, column: string) {
  const index = headerIndex.get(column);
  return index === undefined ? "" : row[index]?.trim() ?? "";
}

function isBlankRow(row: string[]) {
  return row.every((value) => !value.trim());
}

function normalizeTradeDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const dateMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const serial = Number(trimmed);
  if (Number.isFinite(serial) && serial > 0) {
    const utc = Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000;
    return new Date(utc).toISOString().slice(0, 10);
  }

  return trimmed;
}

function normalizeTradeTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    const [, hour, minute] = timeMatch;
    return `${hour.padStart(2, "0")}:${minute}`;
  }

  const serial = Number(trimmed);
  if (Number.isFinite(serial) && serial >= 0 && serial < 1) {
    const totalMinutes = Math.round(serial * 24 * 60);
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return trimmed.slice(0, 5);
}
