import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { DartError } from "./errors.js";
import { packageRoot } from "./paths.js";

let envLoaded = false;

/**
 * 패키지 자체 .env(infra/dart/.env)를 1회 로드한다. 이미 설정된 process.env 는 덮지 않는다.
 * 소비자는 이 함수를 직접 부를 필요 없음 — createDart() 가 알아서 호출.
 */
export function ensureDartEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env"), quiet: true });
}

export interface DartConfig {
    /** 인증키 — 매 요청 쿼리 crtfc_key 로 붙는다(토큰 발급 없음). */
    apiKey: string;
    baseUrl: string;
}

export const DEFAULT_BASE_URL = "https://opendart.fss.or.kr/api";

export interface DartTuning {
    /**
     * 최소 요청 간격(ms). 공식 가이드에 적힌 한도는 일 약 20,000건(오류 020)뿐이고 초당 유량은 공표돼 있지 않다.
     * 서버를 몰아치지 않도록 직렬 간격을 둔다. 실측으로 여유가 확인되면 낮춘다.
     */
    rateLimitMs: number;
}

export const DEFAULT_RATE_LIMIT_MS = 200;

export function resolveTuning(partial: Partial<DartTuning> = {}): DartTuning {
    return { rateLimitMs: partial.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS };
}

/** .env → 설정. 인증키가 없으면 즉시 실패(조용히 오류 코드 맞는 것보다 낫다). */
export function loadDartConfigFromEnv(): DartConfig {
    const apiKey = process.env.DART_API_KEY?.trim();
    if (!apiKey) {
        throw new DartError("DART_API_KEY 가 없다 — infra/dart/.env 를 확인할 것", {
            hint: ".env.example 참고",
        });
    }
    return {
        apiKey,
        baseUrl: process.env.DART_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
}
