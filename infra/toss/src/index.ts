// @trade-data-manager/toss — 토스증권 Open API 공통 레이어(원시 SDK, 포트 모름). krx·dart 패키지와 같은 자리다.
//
// 존재 이유: 키움·KIS 가 약 1년만 주는 국내 1분봉을 2022-11-23 부터 준다(실측). 소비자 = 과거 분봉 백필(infra/broker TossMinuteAdapter)뿐.
// 국내 시세는 KRX+NXT 통합뿐이고 상장폐지 종목은 404 다. 인증은 OAuth client credentials, 토큰은 클라이언트당 하나.

export { TossError } from "./errors.js";
export { type Logger, silentLogger, consoleLogger } from "./logger.js";
export {
    type TossConfig,
    type TossTuning,
    DEFAULT_BASE_URL,
    DEFAULT_RATE_LIMIT_MS,
    DEFAULT_MAX_RETRIES,
    resolveTuning,
    loadTossConfigFromEnv,
    ensureTossEnvLoaded,
} from "./config.js";
export { type TossTransport, type TossHttpResponse, createAxiosTransport } from "./transport.js";
export { TossRest, assertAdvances, type TossRestDeps } from "./rest/client.js";
export { kstOf } from "./rest/kst.js";
export type {
    TossCandle,
    TossCandleInterval,
    TossCandlePage,
    TossCandleQuery,
    TossDayCandle,
    TossDayMinutes,
    TossDayMinutesOptions,
    TossDayWindow,
    TossDecimal,
    TossRateLimit,
    TossTokenInfo,
} from "./rest/types.js";

import {
    loadTossConfigFromEnv,
    ensureTossEnvLoaded,
    resolveTuning,
    type TossConfig,
    type TossTuning,
} from "./config.js";
import { type TossTransport, createAxiosTransport } from "./transport.js";
import { type Logger, consoleLogger } from "./logger.js";
import { TossRest } from "./rest/client.js";

export interface CreateTossOptions {
    /** 기본: loadTossConfigFromEnv() */
    config?: TossConfig;
    /** 기본: createAxiosTransport() */
    transport?: TossTransport;
    /** 기본: consoleLogger */
    logger?: Logger;
    tuning?: Partial<TossTuning>;
}

/** 조립된 토스 핸들. */
export interface Toss {
    rest: TossRest;
    tuning: TossTuning;
    logger: Logger;
}

/** 조각(config·transport·REST)을 배선해 돌려준다. 옵션을 안 주면 패키지 .env 에서 설정을 읽는다. */
export function createToss(options: CreateTossOptions = {}): Toss {
    let config = options.config;
    if (!config) {
        ensureTossEnvLoaded();
        config = loadTossConfigFromEnv();
    }
    const transport = options.transport ?? createAxiosTransport();
    const logger = options.logger ?? consoleLogger;
    const tuning = resolveTuning(options.tuning);

    const rest = new TossRest({
        transport,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        baseUrl: config.baseUrl,
        tuning,
        logger,
    });

    return { rest, tuning, logger };
}
