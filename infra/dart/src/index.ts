// @trade-data-manager/dart — OpenDART 공통 레이어(원시 SDK, 포트 모름). krx 패키지와 같은 자리다.
//
// 존재 이유: KRX·키움에 없는 것 — 법인 ID(corp_code), 공시 사건, 사업보고서 원문.
// 인증은 쿼리 crtfc_key 하나. 한도는 일 약 20,000건(오류 020).

export { DartError } from "./errors.js";
export { type Logger, silentLogger, consoleLogger } from "./logger.js";
export {
    type DartConfig,
    type DartTuning,
    DEFAULT_BASE_URL,
    DEFAULT_RATE_LIMIT_MS,
    resolveTuning,
    loadDartConfigFromEnv,
    ensureDartEnvLoaded,
} from "./config.js";
export { type DartTransport, type DartHttpResponse, createAxiosTransport } from "./transport.js";
export { DartRest, type DartRestDeps } from "./rest/client.js";
export { parseCorpCodeXml } from "./rest/corpCodeXml.js";
export type {
    DartStatus,
    DartCorpCode,
    DartDisclosureQuery,
    DartDisclosure,
    DartDisclosureList,
    DartCompany,
    DartArchiveFile,
} from "./rest/types.js";

import {
    loadDartConfigFromEnv,
    ensureDartEnvLoaded,
    resolveTuning,
    type DartConfig,
    type DartTuning,
} from "./config.js";
import { type DartTransport, createAxiosTransport } from "./transport.js";
import { type Logger, consoleLogger } from "./logger.js";
import { DartRest } from "./rest/client.js";

export interface CreateDartOptions {
    /** 기본: loadDartConfigFromEnv() */
    config?: DartConfig;
    /** 기본: createAxiosTransport() */
    transport?: DartTransport;
    /** 기본: consoleLogger */
    logger?: Logger;
    tuning?: Partial<DartTuning>;
}

/** 조립된 DART 핸들. */
export interface Dart {
    rest: DartRest;
    tuning: DartTuning;
    logger: Logger;
}

/** 조각(config·transport·REST)을 배선해 돌려준다. 옵션을 안 주면 패키지 .env 에서 설정을 읽는다. */
export function createDart(options: CreateDartOptions = {}): Dart {
    let config = options.config;
    if (!config) {
        ensureDartEnvLoaded();
        config = loadDartConfigFromEnv();
    }
    const transport = options.transport ?? createAxiosTransport();
    const logger = options.logger ?? consoleLogger;
    const tuning = resolveTuning(options.tuning);

    const rest = new DartRest({
        transport,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        tuning,
        logger,
    });

    return { rest, tuning, logger };
}
