// apps/batch/scripts/explore/ka10001.ts
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { kiwoomClient } from "../../src/clients/kiwoomClient.js";
import { saveExploration, getStockCodeFromArgs, handleError } from "./_shared.js";

/**
 * [ka10001] 주식기본정보 응답 탐색
 * 사용: pnpm tsx scripts/explore/ka10001.ts [종목코드]
 * 예시: pnpm tsx scripts/explore/ka10001.ts 005930
 */
async function main() {
    const stockCode = getStockCodeFromArgs();

    const res = await kiwoomClient.getBasicInfo(stockCode);

    saveExploration({
        apiId: "ka10001",
        label: stockCode,
        request: { stk_cd: stockCode },
        response: res.data,
        headers: { contYn: res.contYn, nextKey: res.nextKey },
    });
}

main().catch(handleError);
