// apps/processor/src/index.ts
import "dotenv/config";
import { logger } from "./utils/logger.js";
import { pool, db, stocks, themes } from "@trade-data-manager/database";
import { MinuteFeatureService } from "./services/minuteFeatureService.js";
import { ThemeContextService } from "./services/ThemeContextService.js";

async function main() {
    const startTime = Date.now();
    // 실행 시 날짜 인자를 넘겨받음 (예: npx tsx src/index.ts 20260420)
    const tradeDate = process.argv[2];

    if (!tradeDate) {
        logger.error("❌ 가공할 날짜(YYYYMMDD)를 인자로 입력해주세요.");
        process.exit(1);
    }

    logger.info(`🚀 [Processor] ${tradeDate} 데이터 가공 파이프라인 시작`);

    const minuteService = new MinuteFeatureService();
    const themeService = new ThemeContextService();

    try {
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

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`✅ [Processor] 모든 가공 완료! (소요 시간: ${duration}초)`);

    } catch (error) {
        logger.error("❌ [Processor] 가공 중 치명적 오류 발생:", error);
        process.exit(1);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

main();