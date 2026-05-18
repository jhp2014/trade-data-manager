// apps/batch/scripts/explore/ka10081.ts
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { kiwoomClient } from "../../src/clients/kiwoomClient.js";
import { saveExploration, getStockAndDateFromArgs, handleError } from "./_shared.js";

/**
 * [ka10081] 일봉차트조회 응답 탐색 (단일 페이지)
 * 사용: pnpm tsx scripts/explore/ka10081.ts [종목코드] [기준일자(YYYYMMDD)]
 * 예시: pnpm tsx scripts/explore/ka10081.ts 005930 20260515
 *      pnpm tsx scripts/explore/ka10081.ts 005930_AL 20260515   ← NXT 통합
 */
async function main() {
    const { stockCode, baseDate } = getStockAndDateFromArgs("005930", "");

    const res = await kiwoomClient.getDailyChart(stockCode, baseDate);

    // 응답이 너무 길 수 있으므로 캔들 배열은 요약 + 샘플로 변환
    const candles = res.data.stk_dt_pole_chart_qry ?? [];
    const summary = {
        stk_cd: res.data.stk_cd,
        candleCount: candles.length,
        firstCandle: candles[0] ?? null,
        lastCandle: candles[candles.length - 1] ?? null,
        allCandles: candles,  // 전체도 저장은 함
    };

    saveExploration({
        apiId: "ka10081",
        label: `${stockCode}-${baseDate || "latest"}`,
        request: {
            stk_cd: stockCode,
            upd_stkpc_tp: "1",
            base_dt: baseDate,
        },
        response: summary,
        headers: { contYn: res.contYn, nextKey: res.nextKey },
    });
}

main().catch(handleError);
