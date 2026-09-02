import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { KrxError } from "./errors.js";
import { packageRoot } from "./paths.js";

let envLoaded = false;

/**
 * 패키지 자체 .env(infra/krx/.env)를 1회 로드한다.
 * dotenv 기본 동작대로 이미 설정된 process.env 는 덮지 않으므로,
 * VPS/CI 등에서 실제 환경변수를 주면 그게 우선한다(패키지 .env 는 default).
 * 소비자는 이 함수를 직접 부를 필요 없음 — createKrx() 가 알아서 호출.
 */
export function ensureKrxEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env") });
}

export interface KrxConfig {
    /** 인증키 — 매 요청 헤더 AUTH_KEY 로 그대로 붙는다(토큰 발급 없음). */
    authKey: string;
    baseUrl: string;
}

/** 실데이터 호스트. 샘플(/svc/sample/apis)은 고정 응답이라 배선 점검에만 쓴다. */
export const DEFAULT_BASE_URL = "https://data-dbg.krx.co.kr/svc/apis";

export interface KrxTuning {
    /**
     * 최소 요청 간격(ms). KRX 는 초당 유량이 공표돼 있지 않고 **일 10,000건** 한도만 알려져 있다.
     * 우리 최대 소요는 (거래일 × 시장 2) 수준이라 한도는 넉넉하지만, 전종목 응답이 큰 편이라
     * 서버를 몰아치지 않도록 직렬 간격을 둔다. 실측으로 여유가 확인되면 낮춘다.
     */
    rateLimitMs: number;
}

export const DEFAULT_RATE_LIMIT_MS = 200;

export function resolveTuning(partial: Partial<KrxTuning> = {}): KrxTuning {
    return { rateLimitMs: partial.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS };
}

/** .env → 설정. 인증키가 없으면 즉시 실패(조용히 401 맞는 것보다 낫다). */
export function loadKrxConfigFromEnv(): KrxConfig {
    const authKey = process.env.KRX_AUTH_KEY?.trim();
    if (!authKey) {
        throw new KrxError("KRX_AUTH_KEY 가 없다 — infra/krx/.env 를 확인할 것", {
            hint: ".env.example 참고",
        });
    }
    return {
        authKey,
        baseUrl: process.env.KRX_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
}
