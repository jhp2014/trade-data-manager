import { mkdir, readFile, rename } from "fs/promises";
import { basename, dirname, join } from "path";
import { upsertReviewTargets, type Database } from "@trade-data-manager/data-core";
import { logger } from "./logger";
import { listCaptureCsvFiles } from "./fileScan";
import { parseCaptureCsv } from "./parseCapture";

export async function ingestCaptureFolder(db: Database, dir: string): Promise<void> {
  const files = await listCaptureCsvFiles(dir);
  logger.info(`Capture CSV 대상: ${files.length}개`);

  for (const file of files) {
    const sourceFile = basename(file);
    const content = await readFile(file, "utf8");
    const rows = parseCaptureCsv(content, sourceFile);
    await upsertReviewTargets(db, rows);
    await moveToProcessed(file);
    logger.info(`Capture 처리 완료: ${sourceFile} (${rows.length} targets)`);
  }
}

async function moveToProcessed(file: string) {
  const processedDir = join(dirname(file), "processed");
  await mkdir(processedDir, { recursive: true });
  await rename(file, join(processedDir, basename(file)));
}
