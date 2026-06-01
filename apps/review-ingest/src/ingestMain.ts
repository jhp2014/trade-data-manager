import { readFile } from "fs/promises";
import { basename } from "path";
import {
  getOrCreateReviewTargetId,
  insertReviewPointIfAbsent,
  type Database,
} from "@trade-data-manager/data-core";
import { logger } from "./logger";
import { listMainCsvFiles } from "./fileScan";
import { parseMainCsv } from "./parseMain";

export async function ingestMainFolder(db: Database, dir: string): Promise<void> {
  const files = await listMainCsvFiles(dir);
  logger.info(`main CSV 대상: ${files.length}개`);

  for (const file of files) {
    const sourceFile = basename(file);
    const content = await readFile(file, "utf8");
    const parsed = parseMainCsv(content, sourceFile);
    const targetIds = new Map<string, bigint>();

    for (const target of parsed.targets) {
      const id = await getOrCreateReviewTargetId(db, target);
      targetIds.set(targetKey(target.stockCode, target.tradeDate), id);
    }

    for (const { target, point } of parsed.points) {
      const id = targetIds.get(targetKey(target.stockCode, target.tradeDate));
      if (!id) continue;
      await insertReviewPointIfAbsent(db, { reviewTargetId: id, ...point });
    }

    logger.info(
      `main 처리 완료: ${sourceFile} (${parsed.targets.length} targets, ${parsed.points.length} point seeds)`,
    );
  }
}

function targetKey(stockCode: string, tradeDate: string) {
  return `${stockCode}|${tradeDate}`;
}
