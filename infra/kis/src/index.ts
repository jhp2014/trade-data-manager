// @trade-data-manager/kis — 한국투자증권(KIS) REST API 공통 레이어.
// 키움 패키지(@trade-data-manager/kiwoom)와 같은 아키텍처(config·풀·토큰·transport 주입·recon)를 미러링하되,
// KIS 고유의 차이를 반영한다: GET 시세 + 매 요청 appkey/appsecret 헤더, 계좌단위 유량(18/초),
// 유량초과는 429 가 아니라 바디 msg_cd=EGW00201, 토큰발급 1초당 1건.

export { KisError } from "./errors.js";
export { type Logger, silentLogger, consoleLogger } from "./logger.js";
export {
    type KisCredentialConfig,
    type KisConfig,
    type KisTuning,
    DEFAULT_RATE_LIMIT_MS,
    DEFAULT_TOKEN_RATE_LIMIT_MS,
    DEFAULT_COOLDOWN_MS,
    DEFAULT_TOKEN_MARGIN_MS,
    resolveTuning,
    loadKisConfigFromEnv,
    ensureKisEnvLoaded,
} from "./config.js";
export { type KisTransport, type KisHttpResponse, createAxiosTransport } from "./transport.js";
export {
    type TokenStore,
    type TokenCacheEntry,
    credentialCacheKey,
    createFileTokenStore,
    createMemoryTokenStore,
} from "./tokenStore.js";
export { Credential, type CredentialDeps } from "./credential.js";
export { CredentialPool, CredentialLease } from "./credentialPool.js";
export { KisRest, type KisRestDeps, type RequestOptions } from "./rest/client.js";
export type {
    KisApiResponse,
    KisResponseBase,
    KisMinuteCandle,
    KisMinuteChartResponse,
    KisNewsResponse,
    KisListInfoEvent,
    KisListInfoResponse,
} from "./rest/types.js";

import {
    loadKisConfigFromEnv,
    ensureKisEnvLoaded,
    resolveTuning,
    type KisConfig,
    type KisTuning,
} from "./config.js";
import { type KisTransport, createAxiosTransport } from "./transport.js";
import { type TokenStore, createFileTokenStore } from "./tokenStore.js";
import { type Logger, consoleLogger } from "./logger.js";
import { Credential } from "./credential.js";
import { CredentialPool } from "./credentialPool.js";
import { KisRest } from "./rest/client.js";

export interface CreateKisOptions {
    /** 기본: loadKisConfigFromEnv() */
    config?: KisConfig;
    /** 기본: createAxiosTransport() */
    transport?: KisTransport;
    /** 기본: createFileTokenStore() */
    tokenStore?: TokenStore;
    /** 기본: consoleLogger */
    logger?: Logger;
    tuning?: Partial<KisTuning>;
}

/** 조립된 KIS 핸들. rest 로 호출하고, pool 은 토큰 공급/검수에 쓰인다. */
export interface Kis {
    rest: KisRest;
    pool: CredentialPool;
    config: KisConfig;
    tuning: KisTuning;
    logger: Logger;
}

/**
 * 모든 조각(config·transport·tokenStore·풀·REST)을 배선해 돌려준다.
 * 옵션을 안 주면 .env 에서 설정을 읽고 기본 구현을 쓴다.
 */
export function createKis(options: CreateKisOptions = {}): Kis {
    let config = options.config;
    if (!config) {
        // 명시 config 가 없을 때만 패키지 .env 를 자급자족으로 로드한다.
        // (config 주입 시엔 디스크를 안 건드림 → 테스트/외부 주입 경로 순수 유지.)
        ensureKisEnvLoaded();
        config = loadKisConfigFromEnv();
    }
    const transport = options.transport ?? createAxiosTransport();
    const tokenStore = options.tokenStore ?? createFileTokenStore();
    const logger = options.logger ?? consoleLogger;
    const tuning = resolveTuning(config.credentials.length, options.tuning);

    const credentials = config.credentials.map(
        (c) =>
            new Credential(c.appKey, c.appSecret, {
                baseUrl: config.baseUrl,
                transport,
                tokenStore,
                logger,
                tokenMarginMs: tuning.tokenMarginMs,
                tokenRateLimitMs: tuning.tokenRateLimitMs,
            }),
    );
    const pool = new CredentialPool(credentials, tuning);
    const rest = new KisRest({
        pool,
        transport,
        baseUrl: config.baseUrl,
        tuning,
        custType: config.custType,
        logger,
    });

    return { rest, pool, config, tuning, logger };
}
