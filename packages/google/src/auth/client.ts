import { OAuth2Client } from "google-auth-library";
import { loadGoogleOAuthConfig } from "./config.js";
import { createEnvRefreshTokenStore, type RefreshTokenStore } from "./tokenStore.js";

export interface GoogleAuthOptions {
    /** 명시 주입(테스트/멀티계정). 생략 시 env 에서 자급. */
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    /** refresh token 출처 교체(기본: env/.env). */
    tokenStore?: RefreshTokenStore;
}

/**
 * refresh token 이 세팅된 OAuth2 클라이언트를 만든다(런타임 읽기 경로).
 * 반환값은 googleapis 의 `google.drive({ auth })` / `google.sheets({ auth })` 에 그대로 주입 가능하다.
 * 자격/토큰은 인자로 주입하거나, 없으면 env(config + tokenStore)에서 읽는다.
 * access token 갱신은 google-auth-library 가 refresh token 으로 자동 처리.
 */
export function createOAuthClient(opts: GoogleAuthOptions = {}): OAuth2Client {
    const cfg =
        opts.clientId && opts.clientSecret
            ? { clientId: opts.clientId, clientSecret: opts.clientSecret }
            : loadGoogleOAuthConfig();

    const refreshToken =
        opts.refreshToken ?? (opts.tokenStore ?? createEnvRefreshTokenStore()).load();
    if (!refreshToken) {
        throw new Error(
            "[google/auth] refresh token 이 없습니다. " +
                "`pnpm --filter @trade-data-manager/google login` 으로 1회 발급하세요.",
        );
    }

    const client = new OAuth2Client({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
    });
    client.setCredentials({ refresh_token: refreshToken });
    return client;
}
