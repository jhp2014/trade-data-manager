/**
 * OAuth 로그인 CLI. 통합 스코프(drive.file + spreadsheets)로 refresh token 을 발급한다.
 * 사전조건: 루트 .env 에 GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
 *           (또는 기존 GDRIVE_OAUTH_CLIENT_ID / GDRIVE_OAUTH_CLIENT_SECRET).
 * 실행: pnpm --filter @trade-data-manager/google login
 */
import { runOAuthLogin } from "./login.js";

runOAuthLogin().catch((err) => {
    console.error("\n❌ OAuth 로그인 실패");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
