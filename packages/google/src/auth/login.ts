import http from "node:http";
import { OAuth2Client } from "google-auth-library";
import { loadGoogleOAuthConfig } from "./config.js";
import { GOOGLE_OAUTH_SCOPES } from "./scopes.js";
import { createEnvRefreshTokenStore, type RefreshTokenStore } from "./tokenStore.js";

// Desktop 앱은 loopback(http://localhost:임의포트) 리디렉트를 자동 허용한다.
const PORT = 53682;

/**
 * 대화형 OAuth 로그인(발급/쓰기 경로 — 로컬에서만 실행).
 *  1) 브라우저에서 본인 Google 계정으로 동의
 *  2) loopback 으로 code 수신 → refresh token 발급
 *  3) store.save 로 저장(기본: 루트 .env)
 * 통합 스코프(drive.file + spreadsheets)로 1회 발급하면 drive·sheets 둘 다 커버한다.
 * 런타임은 이 함수를 부르지 않는다 — createOAuthClient(load)만 사용.
 */
export async function runOAuthLogin(
    store: RefreshTokenStore = createEnvRefreshTokenStore(),
): Promise<void> {
    const { clientId, clientSecret } = loadGoogleOAuthConfig();
    const redirectUri = `http://localhost:${PORT}`;
    const oauth2 = new OAuth2Client({ clientId, clientSecret, redirectUri });

    const authUrl = oauth2.generateAuthUrl({
        access_type: "offline", // refresh token 발급
        prompt: "consent", // refresh token 강제 재발급(스코프 추가 반영)
        scope: GOOGLE_OAUTH_SCOPES,
    });

    const code = await waitForCode(redirectUri, authUrl);
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
        throw new Error(
            "refresh_token 이 발급되지 않았습니다. consent 화면을 '프로덕션'으로 게시했는지, prompt=consent 인지 확인하세요.",
        );
    }

    store.save(tokens.refresh_token);
    console.log("\n=== refresh token 발급 + 저장 완료 (값은 노출하지 않음) ===");
}

/** loopback 서버를 띄워 동의 후 돌아오는 code 를 1회 수신한다. */
function waitForCode(redirectUri: string, authUrl: string): Promise<string> {
    return new Promise((resolveCode, rejectCode) => {
        const server = http.createServer((req, res) => {
            const u = new URL(req.url ?? "", redirectUri);
            const code = u.searchParams.get("code");
            const err = u.searchParams.get("error");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            if (code) {
                res.end("<h2>인증 완료. 터미널로 돌아가세요.</h2>");
                server.close();
                resolveCode(code);
            } else {
                res.end(`<h2>인증 실패: ${err ?? "unknown"}</h2>`);
                server.close();
                rejectCode(new Error(err ?? "no code"));
            }
        });
        server.listen(PORT, () => {
            console.log("\n아래 URL 을 브라우저에서 열어 본인 Google 계정으로 동의하세요:\n");
            console.log(authUrl + "\n");
            console.log(`(${redirectUri} 로 콜백 대기 중...)`);
        });
    });
}
