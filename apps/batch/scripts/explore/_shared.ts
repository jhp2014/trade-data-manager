// apps/batch/scripts/explore/_shared.ts
import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.cwd(), "logs/raw-samples");

export interface SaveOptions {
    apiId: string;
    label: string;          // 종목코드 등 식별자 (파일명에 사용)
    request: unknown;       // 요청 파라미터
    response: unknown;      // 응답 본문
    headers?: unknown;      // 응답 헤더 (cont-yn, next-key 등)
}

/**
 * 탐색 결과를 콘솔에 출력하고 파일로 저장합니다.
 * 저장 경로: apps/batch/logs/raw-samples/{apiId}-{label}-{timestamp}.json
 */
export function saveExploration(opts: SaveOptions): string {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const now = new Date();
    const ts =
        now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        "-" +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        String(now.getSeconds()).padStart(2, "0");

    const fileName = `${opts.apiId}-${opts.label}-${ts}.json`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    const payload = {
        apiId: opts.apiId,
        label: opts.label,
        timestamp: now.toISOString(),
        request: opts.request,
        responseHeaders: opts.headers ?? null,
        response: opts.response,
        responseKeys: opts.response && typeof opts.response === "object"
            ? Object.keys(opts.response as object)
            : null,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    // 콘솔 출력
    console.log("─".repeat(80));
    console.log(`[${opts.apiId}] ${opts.label}`);
    console.log("─".repeat(80));
    console.log("📤 Request:");
    console.log(JSON.stringify(opts.request, null, 2));
    if (opts.headers) {
        console.log("\n📬 Response Headers:");
        console.log(JSON.stringify(opts.headers, null, 2));
    }
    console.log("\n📥 Response:");
    console.log(JSON.stringify(opts.response, null, 2));
    if (payload.responseKeys) {
        console.log("\n🔑 Top-level Keys:", payload.responseKeys);
    }
    console.log("\n💾 Saved to:", filePath);
    console.log("─".repeat(80));

    return filePath;
}

/**
 * CLI 인자에서 종목코드를 읽습니다. 없으면 기본값(삼성전자).
 * 사용: pnpm tsx scripts/explore/ka10100.ts 005930
 */
export function getStockCodeFromArgs(defaultCode = "005930"): string {
    return process.argv[2] || defaultCode;
}

/**
 * CLI 인자에서 (종목코드, 기준일자) 두 인자를 읽습니다.
 * 사용: pnpm tsx scripts/explore/ka10081.ts 005930 20260515
 */
export function getStockAndDateFromArgs(
    defaultCode = "005930",
    defaultDate = ""
): { stockCode: string; baseDate: string } {
    return {
        stockCode: process.argv[2] || defaultCode,
        baseDate: process.argv[3] || defaultDate,
    };
}

/**
 * 모든 탐색 스크립트의 공통 에러 핸들러.
 */
export function handleError(err: unknown): never {
    console.error("\n❌ 탐색 실패");
    if (err instanceof Error) {
        console.error("Message:", err.message);
        // axios 에러면 응답 본문도 출력
        const anyErr = err as any;
        if (anyErr.response) {
            console.error("HTTP Status:", anyErr.response.status);
            console.error("Response Data:", JSON.stringify(anyErr.response.data, null, 2));
        }
        console.error("\nStack:", err.stack);
    } else {
        console.error(err);
    }
    process.exit(1);
}
