// apps/batch/scripts/explore/ka10081-paginated.ts
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { kiwoomClient } from "../../src/clients/kiwoomClient.js";
import { saveExploration, getStockAndDateFromArgs, handleError } from "./_shared.js";

/**
 * [ka10081] 일봉차트 — 페이지네이션 raw 응답 탐색
 * 페이지별 응답을 각각 파일로 저장합니다.
 *
 * 사용: pnpm tsx scripts/explore/ka10081-paginated.ts [종목코드] [기준일자] [페이지수]
 * 예시: pnpm tsx scripts/explore/ka10081-paginated.ts 005930 20260515 3
 */
async function main() {
    const { stockCode, baseDate } = getStockAndDateFromArgs("005930", "");
    const maxPages = parseInt(process.argv[4] || "3", 10);

    let contYn = "N";
    let nextKey = "";
    let page = 0;
    let totalCandles = 0;

    do {
        page++;
        const res = await kiwoomClient.getDailyChart(stockCode, baseDate, contYn, nextKey);
        const candles = res.data.stk_dt_pole_chart_qry ?? [];
        totalCandles += candles.length;

        saveExploration({
            apiId: "ka10081",
            label: `${stockCode}-page${page}`,
            request: {
                stk_cd: stockCode,
                upd_stkpc_tp: "1",
                base_dt: baseDate,
                contYn,
                nextKey,
            },
            response: {
                stk_cd: res.data.stk_cd,
                candleCount: candles.length,
                firstCandle: candles[0] ?? null,
                lastCandle: candles[candles.length - 1] ?? null,
                allCandles: candles,
            },
            headers: { contYn: res.contYn, nextKey: res.nextKey },
        });

        contYn = res.contYn;
        nextKey = res.nextKey;

        if (page >= maxPages) {
            console.log(`\n⚠️  maxPages(${maxPages})에 도달하여 중단합니다.`);
            break;
        }
    } while (contYn === "Y" && nextKey);

    console.log(`\n✅ 총 ${page}페이지, ${totalCandles}개 캔들 수집`);
}

main().catch(handleError);
