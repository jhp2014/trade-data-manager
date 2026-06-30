import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { packageRoot } from "./paths.js";

let envLoaded = false;

/**
 * 패키지 자체 .env(infra/telegram/.env)를 1회 로드한다.
 * dotenv 기본 동작대로 이미 설정된 process.env 는 덮지 않으므로,
 * VPS/CI 등에서 실제 환경변수를 주면 그게 우선한다(패키지 .env 는 default).
 */
export function ensureTelegramEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env") });
}

export interface TelegramConfig {
    /** my.telegram.org 에서 발급한 앱 식별자. */
    apiId: number;
    /** my.telegram.org 에서 발급한 앱 시크릿(32자 hex). */
    apiHash: string;
    /** 내 계정 전화번호(국가코드 포함). 최초 로그인에만 쓰인다. */
    phone: string;
    /** 2단계 인증 비밀번호. 안 켰으면 undefined. */
    password?: string;
    /**
     * StringSession 직렬화 문자열. 빈 문자열이면 미로그인 상태.
     * recon:login 으로 발급 → .env 에 채우면 이후 무인 접속.
     */
    session: string;
}

/**
 * .env 에서 설정을 읽는다. session 은 비어 있어도 허용(로그인 전 상태).
 * 호출자가 dotenv 를 로드했다고 가정하지 않고, ensureTelegramEnvLoaded 와 함께 쓴다.
 */
export function loadTelegramConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramConfig {
    const apiIdRaw = env.TELEGRAM_API_ID?.trim();
    const apiHash = env.TELEGRAM_API_HASH?.trim();
    const phone = env.TELEGRAM_PHONE?.trim();

    if (!apiIdRaw) throw new Error("TELEGRAM_API_ID 가 .env 에 없습니다");
    if (!apiHash) throw new Error("TELEGRAM_API_HASH 가 .env 에 없습니다");
    if (!phone) throw new Error("TELEGRAM_PHONE 이 .env 에 없습니다");

    const apiId = Number(apiIdRaw);
    if (!Number.isInteger(apiId) || apiId <= 0) {
        throw new Error(`TELEGRAM_API_ID 가 정수가 아닙니다: ${apiIdRaw}`);
    }

    const password = env.TELEGRAM_2FA_PASSWORD?.trim() || undefined;
    const session = env.TELEGRAM_SESSION?.trim() || "";

    return { apiId, apiHash, phone, password, session };
}
