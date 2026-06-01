import type { ReviewTargetSeed } from "@trade-data-manager/data-core";
import { parseCsvRows } from "./csv";
import { parseLineTargets, parseStockCode } from "./parsers";

export function parseCaptureCsv(content: string, sourceFile: string): ReviewTargetSeed[] {
  return parseCsvRows(content)
    .map((row) => ({
      stockCode: parseStockCode(row.stockCode),
      tradeDate: row.tradeDate ?? "",
      stockName: row["_종목명"] || undefined,
      lineTargets: parseLineTargets(row.line_TARGET),
      sourceFile,
    }))
    .filter((row) => row.stockCode.length > 0 && row.tradeDate.length > 0);
}
