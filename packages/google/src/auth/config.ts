import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { packageRoot } from "../paths.js";

let envLoaded = false;

/**
 * 이 패키지 자체 .env(packages/google/.env)를 1회 로드한다(kiwoom-core 와 동일 규약).
 * → 소비 앱은 Google 설정을 몰라도 됨: createOAuthClient() 등이 여기서 자급한다.
 * dotenv 기본 동작대로 이미 설정된 process.env 는 덮지 않으므로,
 * VPS/CI 등에서 실제 환경변수를 주면 그게 우선한다(파일은 default).
 */
export function ensureGoogleEnvLoaded(): void {
    if (envLoaded) return;
    envLoaded = true;
    loadDotenv({ path: resolve(packageRoot, ".env") });
}

export interface GoogleOAuthConfig {
    /** OAuth client(앱) 식별. 토큰 발급/갱신에 사용. */
    clientId: string;
    clientSecret: string;
}

/** 주어진 이름들을 순서대로 보고 처음 발견되는 비어있지 않은 값을 돌려준다. */
function readEnv(...names: string[]): string | undefined {
    for (const name of names) {
        const v = process.env[name]?.trim();
        if (v) return v;
    }
    return undefined;
}

function required(value: string | undefined, label: string): string {
    if (!value) {
        throw new Error(`[google/auth] ${label} 가 필요합니다. (.env 확인)`);
    }
    return value;
}

/**
 * OAuth client 자격을 env 에서 읽는다.
 * GOOGLE_OAUTH_* 를 우선 보고, 없으면 기존 GDRIVE_OAUTH_*(db-backup 시절) 로 폴백한다.
 * → 통합 후에도 기존 .env 그대로 백업이 동작하고, 점진적으로 GOOGLE_OAUTH_* 로 이전 가능.
 */
export function loadGoogleOAuthConfig(): GoogleOAuthConfig {
    ensureGoogleEnvLoaded();
    return {
        clientId: required(
            readEnv("GOOGLE_OAUTH_CLIENT_ID", "GDRIVE_OAUTH_CLIENT_ID"),
            "OAUTH_CLIENT_ID",
        ),
        clientSecret: required(
            readEnv("GOOGLE_OAUTH_CLIENT_SECRET", "GDRIVE_OAUTH_CLIENT_SECRET"),
            "OAUTH_CLIENT_SECRET",
        ),
    };
}
