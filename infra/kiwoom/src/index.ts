// @trade-data-manager/kiwoom — 두 앱(market-eye, trade-data-manager) 공통 키움 API 레이어.
// 기본 진입점은 REST + 토큰/풀. WebSocket 은 './ws' 서브경로로 분리(REST 전용 소비자가 ws 의존성 안 끌어오게).

export { KiwoomError } from "./errors.js";
export {
    type Logger,
    silentLogger,
    consoleLogger,
} from "./logger.js";
export {
    type KiwoomCredentialConfig,
    type KiwoomConfig,
    type KiwoomTuning,
    DEFAULT_RATE_LIMIT_MS,
    DEFAULT_COOLDOWN_MS,
    DEFAULT_TOKEN_MARGIN_MS,
    resolveTuning,
    loadKiwoomConfigFromEnv,
    ensureKiwoomEnvLoaded,
} from "./config.js";
export {
    type KiwoomTransport,
    type KiwoomHttpResponse,
    createAxiosTransport,
} from "./transport.js";
export {
    type TokenStore,
    type TokenCacheEntry,
    credentialCacheKey,
    createFileTokenStore,
    createMemoryTokenStore,
} from "./tokenStore.js";
export { Credential, type CredentialDeps } from "./credential.js";
export { CredentialPool, CredentialLease } from "./credentialPool.js";
export { KiwoomRest, type KiwoomRestDeps, type RequestOptions } from "./rest/client.js";
export type {
    KiwoomApiResponse,
    KiwoomTokenResponse,
    KiwoomKa10001Response,
    KiwoomKa10080Response,
    KiwoomKa10081Response,
    KiwoomKa10100Response,
    KiwoomDailyCandle,
    KiwoomMinuteCandle,
} from "./rest/types.js";

import {
    loadKiwoomConfigFromEnv,
    ensureKiwoomEnvLoaded,
    resolveTuning,
    type KiwoomConfig,
    type KiwoomTuning,
} from "./config.js";
import { type KiwoomTransport, createAxiosTransport } from "./transport.js";
import { type TokenStore, createFileTokenStore } from "./tokenStore.js";
import { type Logger, consoleLogger } from "./logger.js";
import { Credential } from "./credential.js";
import { CredentialPool } from "./credentialPool.js";
import { KiwoomRest } from "./rest/client.js";

export interface CreateKiwoomOptions {
    /** 기본: loadKiwoomConfigFromEnv() */
    config?: KiwoomConfig;
    /** 기본: createAxiosTransport() */
    transport?: KiwoomTransport;
    /** 기본: createFileTokenStore() */
    tokenStore?: TokenStore;
    /** 기본: consoleLogger */
    logger?: Logger;
    tuning?: Partial<KiwoomTuning>;
}

/** 조립된 키움 핸들. rest 로 호출하고, pool 은 WS 토큰 공급 등에 쓰인다. */
export interface Kiwoom {
    rest: KiwoomRest;
    pool: CredentialPool;
    config: KiwoomConfig;
    tuning: KiwoomTuning;
    logger: Logger;
}

/**
 * 모든 조각(config·transport·tokenStore·풀·REST)을 배선해 돌려준다.
 * 옵션을 안 주면 .env 에서 설정을 읽고 기본 구현을 쓴다.
 */
export function createKiwoom(options: CreateKiwoomOptions = {}): Kiwoom {
    let config = options.config;
    if (!config) {
        // 명시 config 가 없을 때만 패키지 .env 를 자급자족으로 로드한다.
        // (config 주입 시엔 디스크를 안 건드림 → 테스트/외부 주입 경로 순수 유지.)
        ensureKiwoomEnvLoaded();
        config = loadKiwoomConfigFromEnv();
    }
    const transport = options.transport ?? createAxiosTransport();
    const tokenStore = options.tokenStore ?? createFileTokenStore();
    const logger = options.logger ?? consoleLogger;
    const tuning = resolveTuning(config.credentials.length, options.tuning);

    const credentials = config.credentials.map(
        (c) =>
            new Credential(c.appKey, c.secretKey, {
                baseUrl: config.baseUrl,
                transport,
                tokenStore,
                logger,
                tokenMarginMs: tuning.tokenMarginMs,
            }),
    );
    const pool = new CredentialPool(credentials, tuning);
    const rest = new KiwoomRest({ pool, transport, baseUrl: config.baseUrl, tuning, logger });

    return { rest, pool, config, tuning, logger };
}
