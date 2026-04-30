// src/index.ts
import "dotenv/config";
import path from "node:path";
import { csvBatchService } from "./services/csv/csvBatchService.js";
import { logger } from "./utils/logger.js";

/**
 * Trade Data Manager — Entry Point
 *
 * 프로젝트 루트의 `csv/` 폴더 내 CSV 파일을 모두 처리한다.
 *
 *  csv/             — 처리 대기 (입력)
 *  csv/processed/   — 처리 완료
 *  csv/failed/      — 처리 실패
 */

const CSV_FOLDER = path.resolve(process.cwd(), "csv");

async function main(): Promise<void> {
    const startedAt = Date.now();
    logger.info(`[Main] 배치 시작 — ${CSV_FOLDER}`);

    try {
        await csvBatchService.processFolder(CSV_FOLDER);

        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        logger.info(`[Main] ✅ 배치 완료 (${elapsedSec}s)`);
        process.exit(0);
    } catch (err) {
        logger.error("[Main] ❌ 치명적 오류:", err);
        process.exit(1);
    }
}

// 안전장치
process.on("SIGINT", () => {
    logger.warn("[Main] SIGINT 수신 — 종료합니다.");
    process.exit(130);
});
process.on("SIGTERM", () => {
    logger.warn("[Main] SIGTERM 수신 — 종료합니다.");
    process.exit(143);
});
process.on("unhandledRejection", (reason) => {
    logger.error("[Main] Unhandled Rejection:", reason);
    process.exit(1);
});

main();
