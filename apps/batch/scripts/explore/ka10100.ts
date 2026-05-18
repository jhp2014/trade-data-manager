// apps/batch/scripts/explore/ka10100.ts
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { kiwoomClient } from "../../src/clients/kiwoomClient.js";
import { saveExploration, getStockCodeFromArgs, handleError } from "./_shared.js";

/**
 * [ka10100] 종목정보조회 응답 탐색
 * 사용: pnpm tsx scripts/explore/ka10100.ts [종목코드]
 * 예시: pnpm tsx scripts/explore/ka10100.ts 067310
 */
async function main() {
    const stockCode = getStockCodeFromArgs();

    const res = await kiwoomClient.getStockInfo(stockCode);

    saveExploration({
        apiId: "ka10100",
        label: stockCode,
        request: { stk_cd: stockCode },
        response: res.data,
        headers: { contYn: res.contYn, nextKey: res.nextKey },
    });
}

main().catch(handleError);
