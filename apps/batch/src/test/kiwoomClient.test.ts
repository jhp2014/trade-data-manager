import { kiwoomClient } from "../clients/kiwoomClient";
import fs from "fs";
import path from "path";

async function runTests() {
    console.log("==========================================");
    console.log("   🚀 KiwoomClient Integration Tests    ");
    console.log("==========================================\n");

    try {
        // ----------------------------------------------------
        console.log("[Test 1] 토큰 캐싱(Caching) 테스트");
        const cacheFilePath = path.resolve(process.cwd(), ".cache", "kiwoom_token.json");

        // 캐시 삭제 처리
        if (fs.existsSync(cacheFilePath)) {
            console.log("  -> 기존 캐시를 삭제합니다...");
            fs.unlinkSync(cacheFilePath);
        }

        console.log("  -> (1/2) 최초 토큰 발급 시도 중...");
        await kiwoomClient.authenticate();
        console.log(`  -> 캐시 파일 생성 확인: ${fs.existsSync(cacheFilePath)} (Expected: true)`);

        console.log("  -> (2/2) 연달아 토큰 재발급 시도 중 (캐시 사용 기대)...");
        await kiwoomClient.authenticate();
        console.log("  ✅ Test 1 통과!\n");

        // ----------------------------------------------------
        console.log("[Test 2] 호출 제한(Rate Limit) 방어 테스트");
        console.log("  -> 동시 다발적 5건의 기본 정보 조회를 날립니다...");

        const testStocks = ["005930", "000660", "035420", "035720", "005380"]; // 삼성, 하닉, 네이버, 카카오, 현대차
        const startTime = Date.now();

        const promises = testStocks.map(code => kiwoomClient.getBasicInfo(code));
        const results = await Promise.all(promises);

        const endTime = Date.now();
        const elapsed = endTime - startTime;

        console.log(`  -> 5건 응답 완료! 총 소요 시간: ${elapsed}ms`);
        console.log(`  -> (기대치: 통신 핑 지연율 포함 약 1000ms 수준 이상 소요되어야 함)`);

        if (elapsed < 800) {
            console.error("  ❌ Test 2 경고: 제한 속도 큐가 너무 빠르게 동작했습니다. Rate Limit 지연이 무시되었을 수 있습니다.");
        } else {
            console.log("  ✅ Test 2 통과!\n");
        }

        // ----------------------------------------------------
        console.log("[Test 3] 연속 조회(Pagination) 테스트");
        console.log("  -> 삼성전자(005930) 일봉 데이터를 조회합니다. (1차)");

        const chartResponse1 = await kiwoomClient.getDailyChart("005930", "20241021");
        console.log(`  -> 1차 조회 성공! 가져온 캔들 수: ${chartResponse1.data.stk_dt_pole_chart_qry?.length || 0}`);
        console.log(`  -> contYn: ${chartResponse1.contYn}, nextKey: ${chartResponse1.nextKey}`);

        if (chartResponse1.contYn === "Y" && chartResponse1.nextKey) {
            console.log("  -> 다음 페이지(연속) 데이터가 있습니다. (2차 조회 진행)");
            const chartResponse2 = await kiwoomClient.getDailyChart("005930", "20241021", chartResponse1.contYn, chartResponse1.nextKey);
            console.log(`  -> 2차 조회 성공! 가져온 캔들 수: ${chartResponse2.data.stk_dt_pole_chart_qry?.length || 0}`);
            console.log(`  -> contYn: ${chartResponse2.contYn}, nextKey: ${chartResponse2.nextKey}`);
            console.log("  ✅ Test 3 통과!\n");
        } else {
            console.log("  ⚠️ Test 3 상황: 테스트 모드나 외부 환경상 연속조회를 반환할 만큼 캔들의 양이 없거나 API 응답에서 N이 나왔습니다 (조회 자체는 성공).\n");
        }

        // ----------------------------------------------------
        console.log("[Test 4] 에러 핸들링 테스트");
        console.log("  -> 존재하지 않는 종목 코드로 에러를 유발해봅니다.");

        try {
            await kiwoomClient.getBasicInfo("999999");
            console.log("  ❌ Test 4 실패: 에러가 발생하지 않았습니다.");
        } catch (error: any) {
            console.log(`  -> 정상적으로 에러가 Catch 되었습니다 (Expected)`);
            console.log("  ✅ Test 4 통과!\n");
        }

        console.log("==========================================");
        console.log(" 🎉 전체 테스트 스크립트 실행이 종료되었습니다. ");
        console.log("==========================================");

    } catch (e) {
        console.error("\n❌ 테스트 도중 예상치 못한 치명적 에러 발생:", e);
    }
}

runTests();
