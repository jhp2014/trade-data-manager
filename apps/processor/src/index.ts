// apps/processor/src/index.ts
import "dotenv/config";
import { logger } from "./utils/logger.js";
import { pool, db, stocks, themes } from "@trade-data-manager/database";
import { MinuteFeatureService } from "./services/minuteFeatureService.js";
import { ThemeContextService } from "./services/ThemeContextService.js";
import { processorRepository } from "./db/processorRepository.js";

async function main() {
    const startTime = Date.now();

    // --force 플래그: 전체 데이터 재가공
    const isForce = process.argv.includes("--force");
    const mode = isForce ? "FORCE (전체 재가공)" : "INCREMENTAL (미가공 날짜만)";

    logger.info("==============================================");
    logger.info(`   🚀 [Processor] 가공 파이프라인 시작`);
    logger.info(`   📌 모드: ${mode}`);
    logger.info("==============================================");

    const minuteService = new MinuteFeatureService();
    const themeService = new ThemeContextService();

    try {
        // 가공 대상 날짜 결정
        const dateRows = isForce
            ? await processorRepository.getAllTradeDates()
            : await processorRepository.getPendingTradeDates();

        const tradeDates = dateRows.map((r) => r.tradeDate);

        if (tradeDates.length === 0) {
            logger.info("✅ 가공할 데이터가 없습니다. (모든 분봉이 이미 처리됨)");
            return;
        }

        logger.info(
            `📅 처리 대상: ${tradeDates.length}개 날짜 [${tradeDates[0]} ~ ${tradeDates[tradeDates.length - 1]}]`
        );

        for (const tradeDate of tradeDates) {
            logger.info(`\n── ${tradeDate} 가공 시작 ──`);

            // 1단계: 모든 종목의 분봉 피처 계산
            const allStocks = await db.select({ code: stocks.stockCode }).from(stocks);
            logger.info(`[Step 1] 종목 피처 가공 시작: ${allStocks.length}건`);
            for (const stock of allStocks) {
                await minuteService.processStockFeatures(stock.code, tradeDate);
            }

            // 2단계: 테마별 통계 및 순위(Context) 계산
            const allThemes = await db.select({ id: themes.themeId }).from(themes);
            logger.info(`[Step 2] 테마 통계 및 순위 가공 시작: ${allThemes.length}건`);
            for (const theme of allThemes) {
                await themeService.processTheme(theme.id, tradeDate);
            }

            logger.info(`── ${tradeDate} 가공 완료 ──`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info("==============================================");
        logger.info(`   ✅ 모든 가공 완료! (소요 시간: ${duration}초)`);
        logger.info("==============================================");

    } catch (error) {
        logger.error("❌ [Processor] 가공 중 치명적 오류 발생:", error);
        process.exit(1);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

main();