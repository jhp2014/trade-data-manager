// src/index.ts
import "dotenv/config";
import { logger } from "@/utils/logger";
import { kiwoomClient } from "@/clients/kiwoomClient";
import { collectorService } from "@/services/collectorService";
import path from "path";

async function main() {
    const startTime = Date.now();
    logger.info("==============================================");
    logger.info("   🚀 주식 데이터 수집 배치 프로세스 시작");
    logger.info("==============================================");

    try {
        // 1. 키움 API 인증 (토큰 발급 또는 캐시 로드)
        //에 정의된 authenticate 메서드를 호출해.
        await kiwoomClient.authenticate();

        // 2. 수집 대상 폴더 지정
        // collectorService는 이 폴더 안의 CSV 파일들을 날짜별로 처리할 거야.
        const csvFolderPath = path.resolve(process.cwd(), "csv");

        // 3. 배치 실행
        //의 collectFromFolder 로직을 통해 ETL 파이프라인 가동!
        await collectorService.collectFromFolder(csvFolderPath);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info("==============================================");
        logger.info(` ✅ 모든 수집 작업이 성공적으로 완료되었습니다. (소요: ${duration}초)`);
        logger.info("==============================================");

    } catch (error) {
        logger.error(" ❌ 배치 실행 중 치명적인 오류가 발생했습니다:", error);
        process.exit(1); // 에러 발생 시 비정상 종료 코드 반환
    } finally {
        // DB 커넥션 풀을 닫아야 프로세스가 깔끔하게 종료돼.
        // 현재 src/db/index.ts의 pool을 export해서 여기서 닫아주는 로직을 추가하면 더 좋아.
        process.exit(0);
    }
}

// 스크립트 실행
main();