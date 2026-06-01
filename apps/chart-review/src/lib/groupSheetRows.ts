import type { ReviewPoint, ReviewStockGroup, SheetPointRow } from "@/types/review";
import { buildManualSummary } from "@/lib/manualSummary";

export function groupSheetRows(rows: SheetPointRow[]): ReviewStockGroup[] {
  const groups = new Map<string, ReviewStockGroup>();

  for (const row of rows) {
    const groupKey = `${row.stockCode}|${row.tradeDate}`;
    const group = groups.get(groupKey);
    const point = toReviewPoint(row);

    if (group) {
      group.points.push(point);
    } else {
      groups.set(groupKey, {
        groupKey,
        stockCode: row.stockCode,
        stockName: row.stockName,
        tradeDate: row.tradeDate,
        points: [point],
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    points: [...group.points].sort((a, b) => a.tradeTime.localeCompare(b.tradeTime)),
  }));
}

function toReviewPoint(row: SheetPointRow): ReviewPoint {
  const pointKey = row.reviewId || `pending:${row.stockCode}|${row.tradeDate}|${row.rowNumber}`;

  return {
    pointKey,
    tradeTime: row.tradeTime,
    rowNumber: row.rowNumber,
    reviewId: row.reviewId,
    amountText: row.features.amountText ?? null,
    manualSummary: buildManualSummary(row.manual),
    sourceRow: row,
  };
}
