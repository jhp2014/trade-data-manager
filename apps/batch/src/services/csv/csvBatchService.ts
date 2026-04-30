import fs from "fs";
import path from "path";
import { logger } from "../../utils/logger.js";
import { marketService } from "../marketService.js";
import { ServiceOperation } from "../decorators.js";
import { parseCsvFile } from "./csvParserService.js";

export class CsvBatchService {

    /**
     * 폴더 내 모든 CSV를 순차 처리합니다.
     * - 성공: csv/processed/
     * - 실패: csv/failed/
     */
    @ServiceOperation("CSV-Batch")
    async processFolder(folderPath: string): Promise<void> {
        const processedDir = path.join(folderPath, "processed");
        const failedDir = path.join(folderPath, "failed");
        fs.mkdirSync(processedDir, { recursive: true });
        fs.mkdirSync(failedDir, { recursive: true });

        const csvFiles = this.scanCsvFiles(folderPath);
        if (csvFiles.length === 0) {
            logger.info(`[CsvBatch] ${folderPath} 처리할 CSV 없음`);
            return;
        }

        logger.info(`[CsvBatch] ${csvFiles.length}개 파일 처리 예정`);

        for (const fileName of csvFiles) {
            const srcPath = path.join(folderPath, fileName);
            try {
                await this.processFile(srcPath);
                this.moveFile(srcPath, path.join(processedDir, fileName));
                logger.info(`[CsvBatch] ✅ ${fileName} → processed/`);
            } catch (err) {
                this.moveFile(srcPath, path.join(failedDir, fileName));
                logger.error(
                    `[CsvBatch] ❌ ${fileName} → failed/ (${(err as Error).message})`
                );
            }
        }

        logger.info(`[CsvBatch] 폴더 배치 완료 — ${csvFiles.length}건`);
    }

    /**
     * 단일 CSV 파일을 처리합니다.
     * 파일명(YYYY-MM-DD)에서 거래일을 추출하고,
     * 종목별로 stock/daily/minute/theme을 동기화합니다.
     */
    @ServiceOperation("CSV-File")
    async processFile(filePath: string): Promise<void> {
        const { tradeDate, targets } = parseCsvFile(filePath);
        const apiDate = tradeDate.replace(/-/g, "");

        logger.info(
            `[CsvBatch] ${tradeDate} 수집 시작 (고유 종목 ${targets.size}건)`
        );

        for (const [stockCode, info] of targets.entries()) {
            try {
                logger.info(`[CsvBatch] [${stockCode}] ${info.stockName} 처리 중`);

                await marketService.syncStockInfo(stockCode);
                await marketService.syncDailyCandles(stockCode, apiDate);
                await marketService.syncMinuteCandles(stockCode, tradeDate);

                for (const theme of info.themes) {
                    await marketService.syncThemeMapping(stockCode, tradeDate, theme);
                }
            } catch (err) {
                // 종목 단위 실패는 다른 종목까지 막지 않도록 catch
                logger.error(`[CsvBatch] ${stockCode} 처리 실패 (건너뜀):`, err);
            }
        }

        logger.info(`[CsvBatch] ${tradeDate} 배치 완료`);
    }

    private scanCsvFiles(folderPath: string): string[] {
        return fs
            .readdirSync(folderPath, { withFileTypes: true })
            .filter((e) => e.isFile() && e.name.endsWith(".csv"))
            .map((e) => e.name)
            .sort(); // YYYY-MM-DD 오름차순
    }

    private moveFile(srcPath: string, destPath: string): void {
        try {
            fs.copyFileSync(srcPath, destPath);
            fs.unlinkSync(srcPath);
        } catch (err) {
            logger.error(`[CsvBatch] 파일 이동 실패 (${srcPath} → ${destPath}):`, err);
            throw err;
        }
    }
}

export const csvBatchService = new CsvBatchService();
