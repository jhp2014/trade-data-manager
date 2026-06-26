// @trade-data-manager/google — auth 서브패스.
// 본인 Google 계정 OAuth 를 한 곳에 모은다(db-backup Drive + sheets 가 공유).
// 런타임은 createOAuthClient(읽기)만, 발급은 runOAuthLogin(쓰기, 로컬 1회).

export { GOOGLE_OAUTH_SCOPES } from "./scopes.js";
export {
    ensureGoogleEnvLoaded,
    loadGoogleOAuthConfig,
    type GoogleOAuthConfig,
} from "./config.js";
export {
    createEnvRefreshTokenStore,
    type RefreshTokenStore,
} from "./tokenStore.js";
export { createOAuthClient, type GoogleAuthOptions } from "./client.js";
export { runOAuthLogin } from "./login.js";
