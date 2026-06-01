import type { ReviewTargetSeed } from "@trade-data-manager/data-core";
import { parseCsvRows } from "./csv";
import { parseLineTargets, parseStockCode } from "./parsers";

export function parseCaptureCsv(content: string, sourceFile: string): ReviewTargetSeed[] {
  const rows = parseCsvRows(content)
    .map((row) => ({
      stockCode: parseStockCode(row.stockCode),
      tradeDate: row.tradeDate ?? "",
      stockName: row["_종목명"] || undefined,
      lineTargets: parseLineTargets(row.line_TARGET),
      sourceFile,
    }))
    .filter((row) => row.stockCode.length > 0 && row.tradeDate.length > 0);

  // 동일 (stockCode, tradeDate)가 한 파일에 중복되면 bulk upsert가
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" 에러를 내므로
  // 마지막 행을 우선해 중복을 제거한다.
  const deduped = new Map<string, ReviewTargetSeed>();
  for (const row of rows) {
    deduped.set(`${row.stockCode}|${row.tradeDate}`, row);
  }
  return [...deduped.values()];
}
