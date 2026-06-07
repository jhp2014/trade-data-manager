/**
 * 일회용 OAuth 로그인: refresh token 발급 후 .env 에 자동 저장.
 * 사전조건: .env 에 GDRIVE_OAUTH_CLIENT_ID / GDRIVE_OAUTH_CLIENT_SECRET 설정.
 *
 * 실행:  pnpm --filter @trade-data-manager/db-backup exec tsx src/oauth-login.ts
 *  1) 터미널에 출력되는 URL 을 브라우저에서 열고 본인 Google 계정으로 동의
 *  2) 동의하면 loopback 으로 코드를 받아 refresh token 을 발급
 *  3) GDRIVE_OAUTH_REFRESH_TOKEN 을 .env 에 자동 기록 (값은 화면에 노출하지 않음)
 */
import http from "node:http";
import fs from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { google } from "googleapis";

const ENV_PATH = resolve(process.cwd(), "../../.env");
loadEnv({ path: ENV_PATH });

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const PORT = 53682; // Desktop 앱은 loopback(http://localhost:임의포트) 리디렉트를 자동 허용

function required(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`환경변수 ${name} 가 필요합니다. (.env 확인)`);
    return v;
}

function persistRefreshToken(token: string): void {
    let env = fs.readFileSync(ENV_PATH, "utf-8");
    const line = `GDRIVE_OAUTH_REFRESH_TOKEN=${token}`;
    if (/^GDRIVE_OAUTH_REFRESH_TOKEN=.*$/m.test(env)) {
        env = env.replace(/^GDRIVE_OAUTH_REFRESH_TOKEN=.*$/m, line);
    } else {
        env += (env.endsWith("\n") ? "" : "\n") + line + "\n";
    }
    fs.writeFileSync(ENV_PATH, env, "utf-8");
}

async function main(): Promise<void> {
    const clientId = required("GDRIVE_OAUTH_CLIENT_ID");
    const clientSecret = required("GDRIVE_OAUTH_CLIENT_SECRET");
    const redirectUri = `http://localhost:${PORT}`;

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authUrl = oauth2.generateAuthUrl({
        access_type: "offline", // refresh token 발급
        prompt: "consent", // refresh token 강제 재발급
        scope: [SCOPE],
    });

    const code: string = await new Promise((resolveCode, rejectCode) => {
        const server = http.createServer((req, res) => {
            const u = new URL(req.url ?? "", redirectUri);
            const c = u.searchParams.get("code");
            const err = u.searchParams.get("error");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            if (c) {
                res.end("<h2>인증 완료. 터미널로 돌아가세요.</h2>");
                server.close();
                resolveCode(c);
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

    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
        throw new Error(
            "refresh_token 이 발급되지 않았습니다. consent 화면을 '프로덕션'으로 게시했는지, prompt=consent 인지 확인하세요.",
        );
    }

    persistRefreshToken(tokens.refresh_token);
    console.log("\n=== refresh token 발급 + .env 저장 완료 (값은 노출하지 않음) ===");
}

main().catch((err) => {
    console.error("\n❌ OAuth 로그인 실패");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
