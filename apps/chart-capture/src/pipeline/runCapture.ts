import fs from "fs/promises";
import path from "path";
import { findStocksMapByCodes } from "@trade-data-manager/data-core";
import type { CaptureConfig } from "../../capture.config";
import { getCaptureDb } from "../data/db";
import { listCsvFiles, parseCsvFile, moveCsvFile, buildSidecarLog } from "./csvIO";
import { startNextServer, verifyExternalServer, getAppDir } from "./nextServer";
import { createPlaywrightDriver, runWithConcurrency } from "./playwrightDriver";
import { buildOutputPath } from "../lib/filename";
import { logger } from "../lib/logger";
import type { CaptureJob, CaptureResult, JobResult } from "../types/capture";

export interface RunSummary {
    csvFiles: number;
    rows: number;
    jobs: number;
    success: number;
    skipped: number;
    failed: number;
    elapsedMs: number;
}

export interface RunCaptureOptions {
    dryRun?: boolean;
    onlyFile?: string;
}

export async function runCapture(config: CaptureConfig, options: RunCaptureOptions = {}): Promise<RunSummary> {
    const { dryRun = false, onlyFile } = options;
    const startTime = Date.now();

    // 디렉토리 보장
    await Promise.all([
        fs.mkdir(config.inputDir, { recursive: true }),
        fs.mkdir(config.outputDir, { recursive: true }),
        fs.mkdir(path.join(config.inputDir, config.processedSubdir), { recursive: true }),
        fs.mkdir(path.join(config.inputDir, config.failedSubdir), { recursive: true }),
    ]);

    // CSV 목록 수집
    let csvFiles = await listCsvFiles(config.inputDir);

    if (onlyFile) {
        const target = path.basename(onlyFile);
        csvFiles = csvFiles.filter((f) => path.basename(f) === target);
        if (csvFiles.length === 0) {
            logger.error(`[pipeline] --file 매칭 결과 없음: ${onlyFile}`);
            return { csvFiles: 0, rows: 0, jobs: 0, success: 0, skipped: 0, failed: 0, elapsedMs: Date.now() - startTime };
        }
    }

    if (csvFiles.length === 0) {
        logger.info("[pipeline] 처리할 CSV 파일이 없습니다.");
        return { csvFiles: 0, rows: 0, jobs: 0, success: 0, skipped: 0, failed: 0, elapsedMs: Date.now() - startTime };
    }
    logger.info(`[pipeline] CSV 파일 ${csvFiles.length}건 발견`);

    const db = getCaptureDb();

    // Next 서버 기동
    let baseUrl: string;
    let stopServer: (() => Promise<void>) | null = null;

    if (config.externalServerUrl) {
        await verifyExternalServer(config.externalServerUrl);
        baseUrl = config.externalServerUrl;
    } else {
        if (dryRun) {
            baseUrl = `http://localhost:${config.nextPort}`;
        } else {
            const handle = await startNextServer({
                port: config.nextPort,
                dev: config.devMode,
                startTimeoutMs: config.nextStartTimeoutMs,
                appDir: getAppDir(),
            });
            baseUrl = handle.baseUrl;
            stopServer = handle.stop;
        }
    }

    // Playwright 기동
    const driver = dryRun ? null : await createPlaywrightDriver(config, baseUrl);

    const summary = { csvFiles: csvFiles.length, rows: 0, jobs: 0, success: 0, skipped: 0, failed: 0, elapsedMs: 0 };

    for (const csvPath of csvFiles) {
        const { rows, errors, duplicateCount } = await parseCsvFile(csvPath, config);
        const basename = path.basename(csvPath);
        if (duplicateCount > 0) {
            logger.warn(`[pipeline] ${basename}: 중복 row ${duplicateCount}건 제거 (동일 종목+날짜)`);
        }

        if (errors.length > 0 && rows.length === 0) {
            // 파싱 전체 실패
            const errLog = buildSidecarLog(errors.map((e) => ({ rowDesc: `L${e.line}`, reason: e.message })));
            await moveCsvFile(csvPath, path.join(config.inputDir, config.failedSubdir), {
                ext: ".error.log",
                content: errLog,
            });
            logger.error(`[pipeline] ${basename}: 파싱 실패 (${errors.length}건)`);
            continue;
        }

        summary.rows += rows.length;

        // 종목 일괄 조회
        const stockCodes = [...new Set(rows.map((r) => r.stockCode))];
        const stocksMap = await findStocksMapByCodes(db, { stockCodes });

        const jobs: CaptureJob[] = [];
        const partialLog: Array<{ rowDesc: string; reason: string }> = [];

        // 파싱 에러 row들도 partial에 기록
        for (const e of errors) {
            partialLog.push({ rowDesc: `L${e.line}`, reason: e.message });
        }

        for (const row of rows) {
            const stock = stocksMap.get(row.stockCode);
            if (!stock) {
                partialLog.push({
                    rowDesc: `${row.stockCode} ${row.tradeDate}`,
                    reason: "unknown-stock-code",
                });
                continue;
            }

            for (const variant of config.variants) {
                if (variant === "NXT" && !stock.isNxtAvailable) {
                    partialLog.push({
                        rowDesc: `${row.stockCode} ${row.tradeDate} NXT`,
                        reason: "skip-nxt-not-supported",
                    });
                    summary.skipped++;
                    continue;
                }

                const outputPath = buildOutputPath({
                    template: config.filenameTemplate,
                    outputDir: config.outputDir,
                    tradeDate: row.tradeDate,
                    dateFormat: config.dateFormat,
                    stockCode: row.stockCode,
                    stockName: stock.stockName,
                    variant,
                    stockNameMaxLength: config.stockNameMaxLength,
                });

                jobs.push({
                    stockCode: row.stockCode,
                    stockName: stock.stockName,
                    tradeDate: row.tradeDate,
                    variant,
                    outputPath,
                    lines: row.lines,
                });
            }
        }

        summary.jobs += jobs.length;

        if (dryRun) {
            for (const job of jobs) {
                logger.info(`[dry-run] ${job.stockCode} ${job.variant} → ${job.outputPath}`);
            }
            continue;
        }

        // 캡처 실행
        const jobResults: JobResult[] = [];
        if (driver) {
            const results = await runWithConcurrency(
                jobs,
                config.concurrency,
                (job) => {
                    logger.info(`[capture] start: ${job.stockCode} ${job.variant}`);
                    return driver.capture(job);
                },
            );
            for (let i = 0; i < jobs.length; i++) {
                jobResults.push({ job: jobs[i], result: results[i] });
            }
        }

        let hasFailure = false;
        for (const { job, result } of jobResults) {
            if (result.status === "success") summary.success++;
            else if (result.status === "skipped") {
                summary.skipped++;
                partialLog.push({
                    rowDesc: `${job.stockCode} ${job.tradeDate} ${job.variant}`,
                    reason: result.reason ?? "skipped",
                });
            } else {
                summary.failed++;
                hasFailure = true;
                partialLog.push({
                    rowDesc: `${job.stockCode} ${job.tradeDate} ${job.variant}`,
                    reason: result.error ?? "failed",
                });
            }
        }

        // CSV 분류·이동
        const hasSidecar = partialLog.length > 0;
        const destSubdir = path.join(config.inputDir, config.processedSubdir);
        await moveCsvFile(
            csvPath,
            destSubdir,
            hasSidecar
                ? { ext: ".partial.log", content: buildSidecarLog(partialLog) }
                : undefined,
        );

        if (hasFailure) {
            logger.warn(`[pipeline] ${basename}: 일부 실패 포함. partial.log 참조.`);
        } else {
            logger.info(`[pipeline] ${basename}: 처리 완료 → processed/`);
        }
    }

    if (driver) await driver.close();
    if (stopServer) await stopServer();
    // DB Pool은 CLI 종료 시점에 정리됨 (cli/index.ts then/catch 체인)

    summary.elapsedMs = Date.now() - startTime;

    const elapsedSec = Math.floor(summary.elapsedMs / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    logger.info(
        `[summary] csv files: ${summary.csvFiles}, rows: ${summary.rows}, jobs: ${summary.jobs}\n` +
        `          success: ${summary.success}, skipped: ${summary.skipped}, failed: ${summary.failed}\n` +
        `          elapsed: ${m}m ${s}s`,
    );

    return summary;
}
