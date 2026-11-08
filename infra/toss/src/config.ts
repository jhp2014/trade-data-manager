import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { TossError } from "./errors.js";
import { packageRoot } from "./paths.js";

let envLoaded = false;

/** 패키지 자체 .env(infra/toss/.env)를 1회 로드한다. 이미 설정된 process.env 는 덮지 않는다. */
export function ensureTossEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env"), quiet: true });
}

export interface TossConfig {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
}

export const DEFAULT_BASE_URL = "https://openapi.tossinvest.com";

export interface TossTuning {
    /** 최소 요청 간격(ms). 캔들 그룹(MARKET_DATA_CHART) 공표 한도 20/초에 여유를 둔 값. 한도는 예고 없이 바뀔 수 있다. */
    rateLimitMs: number;
    /** 429 재시도 횟수. */
    maxRetries: number;
}

export const DEFAULT_RATE_LIMIT_MS = 60;
export const DEFAULT_MAX_RETRIES = 5;

export function resolveTuning(partial: Partial<TossTuning> = {}): TossTuning {
    return {
        rateLimitMs: partial.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS,
        maxRetries: partial.maxRetries ?? DEFAULT_MAX_RETRIES,
    };
}

/** .env → 설정. 자격증명이 없으면 즉시 실패. */
export function loadTossConfigFromEnv(): TossConfig {
    const clientId = process.env.TOSS_CLIENT_ID?.trim();
    const clientSecret = process.env.TOSS_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
        throw new TossError("TOSS_CLIENT_ID·TOSS_CLIENT_SECRET 이 없다 — infra/toss/.env 를 확인할 것", {
            hint: ".env.example 참고",
        });
    }
    return {
        clientId,
        clientSecret,
        baseUrl: process.env.TOSS_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
}
