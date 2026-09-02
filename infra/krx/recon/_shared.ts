// KRX API 정찰(recon) 공용 유틸. 실제 API 를 때려 원시 응답을 로그로 적재 → 사람/AI 검수용.
// 정본 패턴: infra/kis/recon/_shared.ts 미러. 문서 믿지 말고 실측(raw 사이드카 보존).
//
// ⚠ recon 은 DB 를 보지 않는다 — infra/krx 가 persistence 를 의존하면 원시 SDK 층이 깨진다.
//   우리 DB 와의 대조는 종목코드를 인자로 받아 해당 행만 찍고, 대조 자체는 밖에서 한다.
import fs from "node:fs";
import path from "node:path";
import { createKrx, type Krx, type Logger } from "../src/index.js";

// 환경변수 로딩은 패키지가 자급자족(createKrx 가 infra/krx/.env 자동 로드).
// recon 은 "아무것도 모르는 첫 소비자" 역할 → 부품이 혼자 도는지 증명한다.
export function makeKrx(logger?: Logger): Krx {
    return createKrx(logger ? { logger } : {});
}

const OUTPUT_DIR = path.resolve(process.cwd(), "logs/raw-samples");

export interface SaveOptions {
    apiId: string;
    label: string;
    request: unknown;
    response: unknown;
    headers?: unknown;
    /**
     * 요약(response)과 별개로 보존할 "있는 그대로의" 전체 데이터.
     * 넘기면 사이드카 파일 {apiId}-{label}-{ts}.raw.json 에 저장한다(console echo 안 함).
     */
    raw?: unknown;
}

/** 탐색 결과를 콘솔 + 파일(logs/raw-samples/{apiId}-{label}-{ts}.json)로 저장. raw 가 있으면 사이드카(.raw.json)도. */
export function saveExploration(opts: SaveOptions): string {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const ts =
        `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
        `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const filePath = path.join(OUTPUT_DIR, `${opts.apiId}-${opts.label}-${ts}.json`);

    const payload = {
        apiId: opts.apiId,
        label: opts.label,
        timestamp: now.toISOString(),
        request: opts.request,
        responseHeaders: opts.headers ?? null,
        response: opts.response,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    console.log("-".repeat(80));
    console.log(`[${opts.apiId}] ${opts.label}`);
    console.log("Request:", JSON.stringify(opts.request));
    if (opts.headers) console.log("Headers:", JSON.stringify(opts.headers));
    console.log("Response:", JSON.stringify(opts.response, null, 2));
    console.log("Saved:", filePath);

    if (opts.raw !== undefined) {
        const rawPath = filePath.replace(/\.json$/, ".raw.json");
        const rawJson = JSON.stringify(
            { apiId: opts.apiId, label: opts.label, timestamp: now.toISOString(), raw: opts.raw },
            null,
            2,
        );
        fs.writeFileSync(rawPath, rawJson, "utf-8");
        console.log(`Raw saved: ${rawPath} (${(Buffer.byteLength(rawJson) / 1024).toFixed(0)} KB)`);
    }
    console.log("-".repeat(80));
    return filePath;
}

export function argv(index: number, fallback: string): string {
    return process.argv[index] || fallback;
}

/** 오늘 날짜 YYYYMMDD. */
export function today(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function handleError(err: unknown): never {
    console.error("\n정찰 실패");
    if (err instanceof Error) {
        console.error("Message:", err.message);
        const anyErr = err as { meta?: unknown };
        if (anyErr.meta) console.error("Meta:", JSON.stringify(anyErr.meta).slice(0, 2000));
    } else {
        console.error(err);
    }
    process.exit(1);
}
