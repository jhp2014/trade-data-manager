// Telegram(GramJS) 정찰 공용 유틸. 실제 MTProto 를 때려 원시 응답을 로그로 적재 → 사람/AI 검수용.
// 정본 패턴: infra/kis/recon/_shared.ts 미러. 문서 믿지 말고 실측(raw 사이드카 보존).
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ensureTelegramEnvLoaded, loadTelegramConfigFromEnv, type TelegramConfig } from "../src/config.js";

/** 설정 로드(자급자족 .env). 로그인/연결 스크립트가 공유. */
export function loadConfig(): TelegramConfig {
    ensureTelegramEnvLoaded();
    return loadTelegramConfigFromEnv();
}

/** 주어진 세션 문자열로 클라이언트를 만든다(연결 전). GramJS 로그는 error 만. */
export function buildClient(cfg: TelegramConfig, session: string): TelegramClient {
    const client = new TelegramClient(new StringSession(session), cfg.apiId, cfg.apiHash, {
        connectionRetries: 5,
    });
    // GramJS 는 기본 로그가 시끄럽다 → 정찰 출력만 보이게 낮춘다.
    (client as unknown as { setLogLevel?: (l: string) => void }).setLogLevel?.("error");
    return client;
}

/**
 * .env 의 세션으로 이미 로그인된 클라이언트를 연결해 돌려준다.
 * 세션이 없으면 친절히 막는다(먼저 recon:login).
 */
export async function connectedClient(): Promise<TelegramClient> {
    const cfg = loadConfig();
    if (!cfg.session) {
        throw new Error(
            "TELEGRAM_SESSION 이 비었습니다 — 먼저 `pnpm --filter @trade-data-manager/telegram recon:login` 으로 세션을 발급하세요.",
        );
    }
    const client = buildClient(cfg, cfg.session);
    await client.connect();
    return client;
}

/** 콘솔에서 한 줄 입력받는다(로그인 코드/2FA 등 대화형). */
export async function ask(question: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await rl.question(question);
        return answer.trim();
    } finally {
        rl.close();
    }
}

const OUTPUT_DIR = path.resolve(process.cwd(), "logs/raw-samples");

export interface SaveOptions {
    label: string;
    request: unknown;
    response: unknown;
    /** 요약(response)과 별개로 보존할 "있는 그대로의" 전체 데이터 → {label}-{ts}.raw.json. */
    raw?: unknown;
}

/** 탐색 결과를 콘솔 + 파일(logs/raw-samples/{label}-{ts}.json)로 저장. raw 가 있으면 사이드카(.raw.json)도. */
export function saveExploration(opts: SaveOptions): string {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const ts =
        `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
        `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const filePath = path.join(OUTPUT_DIR, `${opts.label}-${ts}.json`);

    const payload = {
        label: opts.label,
        timestamp: now.toISOString(),
        request: opts.request,
        response: opts.response,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    console.log("─".repeat(80));
    console.log(`[telegram] ${opts.label}`);
    console.log("📤 Request:", JSON.stringify(opts.request));
    console.log("📥 Response:", JSON.stringify(opts.response, null, 2));
    console.log("💾 Saved:", filePath);

    if (opts.raw !== undefined) {
        const rawPath = filePath.replace(/\.json$/, ".raw.json");
        const rawJson = JSON.stringify(
            { label: opts.label, timestamp: now.toISOString(), raw: opts.raw },
            null,
            2,
        );
        fs.writeFileSync(rawPath, rawJson, "utf-8");
        console.log(`🗄️  Raw saved: ${rawPath} (${(Buffer.byteLength(rawJson) / 1024).toFixed(0)} KB)`);
    }
    console.log("─".repeat(80));
    return filePath;
}

export function argv(index: number, fallback: string): string {
    return process.argv[index] || fallback;
}

export function handleError(err: unknown): never {
    console.error("\n❌ 정찰 실패");
    if (err instanceof Error) {
        console.error("Message:", err.message);
        const anyErr = err as { errorMessage?: unknown; code?: unknown };
        if (anyErr.errorMessage) console.error("TL Error:", String(anyErr.errorMessage));
        if (anyErr.code) console.error("Code:", String(anyErr.code));
    } else {
        console.error(err);
    }
    process.exit(1);
}
