import { kiwoomClient } from "../clients/kiwoomClient.js";
import "dotenv/config";

async function comparePredPre() {
    console.log("====================================================");
    console.log("   🔍 Kiwoom API pred_pre 비교 테스트 (KRX vs NXT)   ");
    console.log("====================================================\n");

    try {
        // 1. 인증
        console.log("-> 키움 API 인증 중...");
        await kiwoomClient.authenticate();

        const stockCodeKrx = "005930";
        const stockCodeNxt = "005930_AL";
        const baseDate = "20260420";

        // 2. 데이터 요청
        console.log(`-> 데이터 요청: KRX(${stockCodeKrx}), NXT(${stockCodeNxt})`);
        const [resKrx, resNxt] = await Promise.all([
            kiwoomClient.getDailyChart(stockCodeKrx, baseDate),
            kiwoomClient.getDailyChart(stockCodeNxt, baseDate)
        ]);

        const krxList = resKrx.data.stk_dt_pole_chart_qry || [];
        const nxtList = resNxt.data.stk_dt_pole_chart_qry || [];

        const compareCount = Math.min(5, krxList.length, nxtList.length);

        console.log(`\n최근 ${compareCount}개 캔들 비교 (현재가 및 pred_pre):\n`);
        console.log(`| 날짜     | KRX 종가 | KRX 전일대비 | NXT 종가 | NXT 전일대비 | 일치여부 |`);
        console.log(`|----------|----------|--------------|----------|--------------|----------|`);

        for (let i = 0; i < compareCount; i++) {

            const k = krxList[i];
            const n = nxtList[i];

            console.log(`Date: ${k.dt}, KRX pred_pre: ${k.pred_pre}, NXT pred_pre: ${n.pred_pre}`);
            console.log(`Date: ${k.dt}, KRX price: ${k.open_pric} ${k.low_pric} ${k.cur_prc} ${k.high_pric}, NXT price: ${n.open_pric} ${n.low_pric} ${n.cur_prc} ${n.high_pric}`);
        }

    } catch (error) {
        console.error("❌ 테스트 도중 에러 발생:", error);
    }
}

comparePredPre();
