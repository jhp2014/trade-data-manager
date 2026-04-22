// src/index.ts
import "dotenv/config";
import { logger } from "@/utils/logger";
import { kiwoomClient } from "@/clients/kiwoomClient";
import { collectorService } from "@/services/collectorService";
import { pool } from "@trade-data-manager/database";
import path from "path";

async function main() {
    const startTime = Date.now();
    logger.info("==============================================");
    logger.info("   🚀 주식 데이터 수집 배치 프로세스 시작");
    logger.info("==============================================");

    try {
        // 1. 키움 API 인증 (토큰 발급 또는 캐시 로드)
        await kiwoomClient.authenticate();

        // 2. 수집 대상 폴더 지정
        const csvFolderPath = path.resolve(process.cwd(), "csv");

        // 3. 배치 실행
        await collectorService.collectFromFolder(csvFolderPath);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info("==============================================");
        logger.info(` ✅ 모든 수집 작업이 성공적으로 완료되었습니다. (소요: ${duration}초)`);
        logger.info("==============================================");

    } catch (error) {
        logger.error(" ❌ 배치 실행 중 치명적인 오류가 발생했습니다:", error);
        process.exit(1); 
    } finally {
        await pool.end();
        process.exit(0);
    }
}

// 스크립트 실행
main();