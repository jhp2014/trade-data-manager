import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { KisError } from "./errors.js";
import { packageRoot } from "./paths.js";

let envLoaded = false;

/**
 * 패키지 자체 .env(packages/kis/.env)를 1회 로드한다.
 * dotenv 기본 동작대로 이미 설정된 process.env 는 덮지 않으므로,
 * VPS/CI 등에서 실제 환경변수를 주면 그게 우선한다(패키지 .env 는 default).
 * 소비자는 이 함수를 직접 부를 필요 없음 — createKis() 가 알아서 호출.
 */
export function ensureKisEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env") });
}

export interface KisCredentialConfig {
    appKey: string;
    appSecret: string;
}

export interface KisConfig {
    /** 1~N 개. 라운드로빈 대상. 1개면 로테이션은 no-op. */
    credentials: KisCredentialConfig[];
    baseUrl: string;
    /** 고객 타입: 개인 "P" / 법인 "B". 모든 시세 요청 헤더(custtype)에 붙는다. */
    custType: string;
}

export interface KisTuning {
    /**
     * 자격증명(=계좌/앱키) 단위 최소 요청 간격(ms).
     * KIS 유량은 계좌당 1초당 18건(실전) → 키움처럼 TR별이 아니라 계좌 전역이 버킷.
     * 18건/초는 ~56ms 이지만 KIS 권고("동시호출 100~150ms 텀")와 분산정책 여유를 둬 70ms 기본.
     */
    rateLimitMs: number;
    /** 토큰 발급(/oauth2/tokenP) 전용 최소 간격(ms). KIS 한도는 1초당 1건 → 1100ms 여유. */
    tokenRateLimitMs: number;
    /** 유량 초과(EGW00201) 맞은 자격증명을 쉬게 할 시간(ms). */
    cooldownMs: number;
    /** failover/재시도 최대 횟수. */
    maxRetries: number;
    /** 토큰 만료 판단 여유(ms). */
    tokenMarginMs: number;
}

/** KIS 한도: 계좌당 1초당 18건(실전) → 56ms 이지만 분산정책 여유로 70ms. */
export const DEFAULT_RATE_LIMIT_MS = 70;
/** 토큰 발급은 1초당 1건 → 1.1초 간격. */
export const DEFAULT_TOKEN_RATE_LIMIT_MS = 1100;
export const DEFAULT_COOLDOWN_MS = 1000;
export const DEFAULT_TOKEN_MARGIN_MS = 5 * 60 * 1000;

export function resolveTuning(credentialCount: number, partial: Partial<KisTuning> = {}): KisTuning {
    return {
        rateLimitMs: partial.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS,
        tokenRateLimitMs: partial.tokenRateLimitMs ?? DEFAULT_TOKEN_RATE_LIMIT_MS,
        cooldownMs: partial.cooldownMs ?? DEFAULT_COOLDOWN_MS,
        // 키 개수만큼 failover 여지를 주고 + 2 여유(네트워크/토큰 재시도).
        maxRetries: partial.maxRetries ?? credentialCount + 2,
        tokenMarginMs: partial.tokenMarginMs ?? DEFAULT_TOKEN_MARGIN_MS,
    };
}

/**
 * .env 에서 설정을 읽는다(라이브러리는 dotenv 를 직접 로드하지 않음 — 호출자가 로드).
 * 자격증명 수집 규칙(후방호환):
 *   - KIS_APP_KEY / KIS_APP_SECRET            → 키 #1 (단일키 .env 그대로 동작)
 *   - KIS_APP_KEY_1..20 / KIS_APP_SECRET_1..20 → 추가 키
 * 존재하는 것만 모아 1~N 개 풀을 만든다. appKey 중복은 제거.
 */
export function loadKisConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KisConfig {
    const credentials = collectCredentials(env);
    if (credentials.length === 0) {
        throw new KisError(
            "KIS 자격증명이 없습니다 — .env 에 KIS_APP_KEY / KIS_APP_SECRET (또는 _1.._N) 설정 필요",
        );
    }
    const baseUrl = env.KIS_BASE_URL?.trim();
    if (!baseUrl) throw new KisError("KIS_BASE_URL 이 .env 에 없습니다");
    assertUrl(baseUrl, "KIS_BASE_URL");

    const custType = env.KIS_CUST_TYPE?.trim() || "P";

    return { credentials, baseUrl, custType };
}

function collectCredentials(env: NodeJS.ProcessEnv): KisCredentialConfig[] {
    const out: KisCredentialConfig[] = [];
    const seen = new Set<string>();
    const add = (appKey?: string, appSecret?: string) => {
        const a = appKey?.trim();
        const s = appSecret?.trim();
        if (a && s && !seen.has(a)) {
            seen.add(a);
            out.push({ appKey: a, appSecret: s });
        }
    };
    add(env.KIS_APP_KEY, env.KIS_APP_SECRET);
    for (let i = 1; i <= 20; i++) {
        add(env[`KIS_APP_KEY_${i}`], env[`KIS_APP_SECRET_${i}`]);
    }
    return out;
}

function assertUrl(value: string, name: string): void {
    try {
        new URL(value);
    } catch {
        throw new KisError(`${name} 형식이 URL 이 아닙니다: ${value}`);
    }
}
