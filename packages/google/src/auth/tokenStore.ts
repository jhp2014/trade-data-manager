import fs from "node:fs";
import { resolve } from "node:path";
import { packageRoot } from "../paths.js";
import { ensureGoogleEnvLoaded } from "./config.js";

/**
 * refresh token 저장소 추상화.
 * - load(): 런타임이 매번 쓰는 읽기 경로. **쓰기를 하지 않으므로** 읽기전용 컨테이너(클라우드)에서도 안전.
 * - save(): 발급(oauth-login) 1회성 경로 전용. 로컬에서만 호출된다.
 * 기본 구현은 env/.env 파일이지만 주입형이라 나중에 secret manager 등으로 교체 가능.
 */
export interface RefreshTokenStore {
    load(): string | null;
    save(token: string): void;
}

const PACKAGE_ENV = resolve(packageRoot, ".env");
const ENV_VAR = "GOOGLE_OAUTH_REFRESH_TOKEN";
const LEGACY_ENV_VAR = "GDRIVE_OAUTH_REFRESH_TOKEN";

/**
 * 기본 저장소(패키지-로컬 .env 기반, kiwoom-core 와 동일 규약).
 * - load: env(GOOGLE_OAUTH_REFRESH_TOKEN, 없으면 legacy GDRIVE_OAUTH_REFRESH_TOKEN — db-backup 전환기 브리지)
 *         — 클라우드에선 플랫폼 주입 env 가 그대로 읽힘.
 * - save: packages/google/.env 에 GOOGLE_OAUTH_REFRESH_TOKEN 기록(로컬 발급 전용). 값은 process.env 에도 즉시 반영.
 */
export function createEnvRefreshTokenStore(): RefreshTokenStore {
    return {
        load() {
            ensureGoogleEnvLoaded();
            return (
                process.env[ENV_VAR]?.trim() ||
                process.env[LEGACY_ENV_VAR]?.trim() ||
                null
            );
        },
        save(token) {
            let env = fs.existsSync(PACKAGE_ENV) ? fs.readFileSync(PACKAGE_ENV, "utf8") : "";
            const line = `${ENV_VAR}=${token}`;
            const re = new RegExp(`^${ENV_VAR}=.*$`, "m");
            if (re.test(env)) {
                env = env.replace(re, line);
            } else {
                env += (env === "" || env.endsWith("\n") ? "" : "\n") + line + "\n";
            }
            fs.writeFileSync(PACKAGE_ENV, env, "utf8");
            process.env[ENV_VAR] = token;
        },
    };
}
