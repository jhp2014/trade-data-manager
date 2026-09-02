// @trade-data-manager/krx — KRX 정보데이터시스템 OPEN API 공통 레이어.
// kis/kiwoom 패키지와 같은 자리(원시 SDK, 포트 모름)지만 훨씬 얇다: 토큰 발급도, 자격증명 풀도 없고
// 요청마다 헤더 AUTH_KEY 하나 + GET 쿼리 basDd 하나가 전부다. 한도는 일 10,000건.
//
// 존재 이유: 시총 백필의 상장주식수(LIST_SHRS). 기존 KIS 예탁원 이벤트 역산은 재상장류
// (액면분할·병합·감자)에서 원리적으로 과거 주식수를 복원할 수 없다 — 이 소스가 그 값을 직접 준다.

export { KrxError } from "./errors.js";
export { type Logger, silentLogger, consoleLogger } from "./logger.js";
export {
    type KrxConfig,
    type KrxTuning,
    DEFAULT_BASE_URL,
    DEFAULT_RATE_LIMIT_MS,
    resolveTuning,
    loadKrxConfigFromEnv,
    ensureKrxEnvLoaded,
} from "./config.js";
export { type KrxTransport, type KrxHttpResponse, createAxiosTransport } from "./transport.js";
export { KrxRest, type KrxRestDeps } from "./rest/client.js";
export type {
    KrxApiResponse,
    KrxMarket,
    KrxByddTrdRow,
    KrxByddTrdResponse,
} from "./rest/types.js";

import {
    loadKrxConfigFromEnv,
    ensureKrxEnvLoaded,
    resolveTuning,
    type KrxConfig,
    type KrxTuning,
} from "./config.js";
import { type KrxTransport, createAxiosTransport } from "./transport.js";
import { type Logger, consoleLogger } from "./logger.js";
import { KrxRest } from "./rest/client.js";

export interface CreateKrxOptions {
    /** 기본: loadKrxConfigFromEnv() */
    config?: KrxConfig;
    /** 기본: createAxiosTransport() */
    transport?: KrxTransport;
    /** 기본: consoleLogger */
    logger?: Logger;
    tuning?: Partial<KrxTuning>;
}

/** 조립된 KRX 핸들. */
export interface Krx {
    rest: KrxRest;
    config: KrxConfig;
    tuning: KrxTuning;
    logger: Logger;
}

/**
 * 조각(config·transport·REST)을 배선해 돌려준다.
 * 옵션을 안 주면 .env 에서 설정을 읽고 기본 구현을 쓴다.
 */
export function createKrx(options: CreateKrxOptions = {}): Krx {
    let config = options.config;
    if (!config) {
        // 명시 config 가 없을 때만 패키지 .env 를 자급자족으로 로드한다.
        // (config 주입 시엔 디스크를 안 건드림 → 테스트/외부 주입 경로 순수 유지.)
        ensureKrxEnvLoaded();
        config = loadKrxConfigFromEnv();
    }
    const transport = options.transport ?? createAxiosTransport();
    const logger = options.logger ?? consoleLogger;
    const tuning = resolveTuning(options.tuning);

    const rest = new KrxRest({
        transport,
        authKey: config.authKey,
        baseUrl: config.baseUrl,
        tuning,
        logger,
    });

    return { rest, config, tuning, logger };
}
