// apps/processor/src/opportunity.ts
import "dotenv/config";
import { logger } from "./utils/logger.js";
import { pool } from "@trade-data-manager/database";
import { OpportunityService } from "./services/opportunityService";
import path from "path";

async function run() {
    logger.info("🎯 Trading Opportunity 배치 스캔 시작");

    try {
        const opportunityService = new OpportunityService();

        // 📁 분석 대상 CSV 파일들이 모여있는 폴더 경로
        const targetFolder = path.resolve(process.cwd(), "csv_opportunity");

        await opportunityService.collectFromFolder(targetFolder);

        logger.info("✅ 폴더 내 모든 파일 처리가 종료되었습니다.");
    } catch (error) {
        logger.error("❌ 배치 실행 중 치명적 오류:", error);
    } finally {
        await pool.end();
    }
}

run();