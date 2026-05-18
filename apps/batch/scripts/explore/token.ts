// apps/batch/scripts/explore/token.ts
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import axios from "axios";
import { kiwoomConfig } from "../../src/clients/config.js";
import { saveExploration, handleError } from "./_shared.js";

/**
 * [au10001] 접근토큰 발급 응답 탐색
 * 사용: pnpm tsx scripts/explore/token.ts
 */
async function main() {
    const request = {
        grant_type: "client_credentials",
        appkey: kiwoomConfig.appKey,
        secretkey: "***REDACTED***",  // 화면 출력용 마스킹
    };

    const response = await axios.post(
        `${kiwoomConfig.baseUrl}/oauth2/token`,
        {
            grant_type: "client_credentials",
            appkey: kiwoomConfig.appKey,
            secretkey: kiwoomConfig.secretKey,
        }
    );

    // 응답에서 token 값은 마스킹 (raw-samples 파일에 그대로 저장되지 않도록)
    const safeResponse = {
        ...response.data,
        token: response.data.token
            ? `${response.data.token.slice(0, 8)}...(masked)`
            : null,
    };

    saveExploration({
        apiId: "au10001",
        label: "token",
        request,
        response: safeResponse,
        headers: {
            "content-type": response.headers["content-type"],
        },
    });
}

main().catch(handleError);
