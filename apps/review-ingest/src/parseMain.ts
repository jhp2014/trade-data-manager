import type { ParsedMainCsv, ReviewTargetSeed } from "./types";
import { parseCsvRows } from "./csv";
import { collectPayload, parseLineTargets, parseStockCode, parseTradeTime } from "./parsers";

export function parseMainCsv(content: string, sourceFile: string): ParsedMainCsv {
  const targets: ReviewTargetSeed[] = [];
  const points: ParsedMainCsv["points"] = [];

  for (const row of parseCsvRows(content)) {
    const target: ReviewTargetSeed = {
      stockCode: parseStockCode(row.stockCode),
      tradeDate: row.tradeDate ?? "",
      stockName: row["_종목명"] || undefined,
      lineTargets: parseLineTargets(row.line_TARGET),
      sourceFile,
    };

    if (!target.stockCode || !target.tradeDate) continue;
    targets.push(target);

    const tradeTime = parseTradeTime(row.tradeTime);
    if (!tradeTime) continue;

    points.push({
      target,
      point: {
        tradeTime,
        payloadJson: collectPayload(row),
      },
    });
  }

  return { targets, points };
}
