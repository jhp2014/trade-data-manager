import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { KiwoomError } from "./errors.js";
import { packageRoot } from "./paths.js";

let envLoaded = false;

/**
 * 패키지 자체 .env(packages/kiwoom/.env)를 1회 로드한다.
 * dotenv 기본 동작대로 이미 설정된 process.env 는 덮지 않으므로,
 * VPS/CI 등에서 실제 환경변수를 주면 그게 우선한다(패키지 .env 는 default).
 * 소비자는 이 함수를 직접 부를 필요 없음 — createKiwoom() 이 알아서 호출.
 */
export function ensureKiwoomEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env") });
}

export interface KiwoomCredentialConfig {
    appKey: string;
    secretKey: string;
}

export interface KiwoomConfig {
    /** 1~N 개. 라운드로빈 대상. 1개면 로테이션은 no-op. */
    credentials: KiwoomCredentialConfig[];
    baseUrl: string;
    /** WebSocket(실시간/조건검색) URL. 없으면 WS 생성 불가. */
    wsUrl?: string;
}

export interface KiwoomTuning {
    /** (자격증명 × TR) 단위 최소 요청 간격(ms). 키움 한도는 TR당 5건/초 → 200ms. */
    rateLimitMs: number;
    /** rate limit(429) 맞은 자격증명을 쉬게 할 시간(ms). */
    cooldownMs: number;
    /** failover/재시도 최대 횟수. */
    maxRetries: number;
    /** 토큰 만료 판단 여유(ms). */
    tokenMarginMs: number;
}

/** 키움 한도: TR(api-id)당 초당 5건 → 200ms 간격. */
export const DEFAULT_RATE_LIMIT_MS = 200;
export const DEFAULT_COOLDOWN_MS = 1000;
export const DEFAULT_TOKEN_MARGIN_MS = 5 * 60 * 1000;

export function resolveTuning(credentialCount: number, partial: Partial<KiwoomTuning> = {}): KiwoomTuning {
    return {
        rateLimitMs: partial.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS,
        cooldownMs: partial.cooldownMs ?? DEFAULT_COOLDOWN_MS,
        // 키 개수만큼 failover 여지를 주고 + 2 여유(네트워크/토큰 재시도).
        maxRetries: partial.maxRetries ?? credentialCount + 2,
        tokenMarginMs: partial.tokenMarginMs ?? DEFAULT_TOKEN_MARGIN_MS,
    };
}

/**
 * .env 에서 설정을 읽는다(라이브러리는 dotenv 를 직접 로드하지 않음 — 호출자가 로드).
 * 자격증명 수집 규칙(후방호환):
 *   - KIWOOM_APP_KEY / KIWOOM_SECRET_KEY        → 키 #1 (기존 단일키 .env 그대로 동작)
 *   - KIWOOM_APP_KEY_1..20 / KIWOOM_SECRET_KEY_1..20 → 추가 키
 * 존재하는 것만 모아 1~N 개 풀을 만든다. appKey 중복은 제거.
 */
export function loadKiwoomConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KiwoomConfig {
    const credentials = collectCredentials(env);
    if (credentials.length === 0) {
        throw new KiwoomError(
            "키움 자격증명이 없습니다 — .env 에 KIWOOM_APP_KEY / KIWOOM_SECRET_KEY (또는 _1.._N) 설정 필요",
        );
    }
    const baseUrl = env.KIWOOM_BASE_URL?.trim();
    if (!baseUrl) throw new KiwoomError("KIWOOM_BASE_URL 이 .env 에 없습니다");
    assertUrl(baseUrl, "KIWOOM_BASE_URL");

    const wsUrl = env.KIWOOM_WS_URL?.trim() || undefined;
    if (wsUrl) assertUrl(wsUrl, "KIWOOM_WS_URL");

    return { credentials, baseUrl, wsUrl };
}

function collectCredentials(env: NodeJS.ProcessEnv): KiwoomCredentialConfig[] {
    const out: KiwoomCredentialConfig[] = [];
    const seen = new Set<string>();
    const add = (appKey?: string, secretKey?: string) => {
        const a = appKey?.trim();
        const s = secretKey?.trim();
        if (a && s && !seen.has(a)) {
            seen.add(a);
            out.push({ appKey: a, secretKey: s });
        }
    };
    add(env.KIWOOM_APP_KEY, env.KIWOOM_SECRET_KEY);
    for (let i = 1; i <= 20; i++) {
        add(env[`KIWOOM_APP_KEY_${i}`], env[`KIWOOM_SECRET_KEY_${i}`]);
    }
    return out;
}

function assertUrl(value: string, name: string): void {
    try {
        new URL(value);
    } catch {
        throw new KiwoomError(`${name} 형식이 URL 이 아닙니다: ${value}`);
    }
}
