// apps/batch/scripts/explore/ka10080.ts
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { kiwoomClient } from "../../src/clients/kiwoomClient.js";
import { saveExploration, getStockAndDateFromArgs, handleError } from "./_shared.js";

/**
 * [ka10080] 분봉차트조회 응답 탐색 (단일 페이지)
 * 사용: pnpm tsx scripts/explore/ka10080.ts [종목코드] [기준일자(YYYYMMDD)]
 * 예시: pnpm tsx scripts/explore/ka10080.ts 005930 20260515
 *      pnpm tsx scripts/explore/ka10080.ts 005930_AL 20260515   ← NXT 통합
 */
async function main() {
    const { stockCode, baseDate } = getStockAndDateFromArgs("005930", "");

    const res = await kiwoomClient.getMinuteChart(stockCode, baseDate);

    const candles = res.data.stk_min_pole_chart_qry ?? [];
    const summary = {
        stk_cd: res.data.stk_cd,
        candleCount: candles.length,
        firstCandle: candles[0] ?? null,
        lastCandle: candles[candles.length - 1] ?? null,
        allCandles: candles,
    };

    saveExploration({
        apiId: "ka10080",
        label: `${stockCode}-${baseDate || "latest"}`,
        request: {
            stk_cd: stockCode,
            tic_scope: "1",
            upd_stkpc_tp: "1",
            base_dt: baseDate,
        },
        response: summary,
        headers: { contYn: res.contYn, nextKey: res.nextKey },
    });
}

main().catch(handleError);
