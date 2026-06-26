/**
 * auth 스모크 체크: packages/google/.env 만으로(루트 .env 의존 없이)
 * refresh token → access token 발급이 되는지 확인한다.
 * 실행: pnpm --filter @trade-data-manager/google recon:auth
 * (토큰 값은 출력하지 않는다.)
 */
import { createOAuthClient } from "../src/auth/index.js";

async function main(): Promise<void> {
    const client = createOAuthClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("access token 미발급");
    console.log(`✅ access token 발급 OK (len ${token.length}) — 패키지 자급 env 동작 확인`);

    // 발급된 토큰의 실제 부여 스코프 확인(tokeninfo). 값은 스코프 목록뿐이라 비밀 아님.
    const res = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
    );
    const info = (await res.json()) as { scope?: string };
    const scopes = (info.scope ?? "").split(/\s+/).filter(Boolean);
    const hasDrive = scopes.some((s) => s.includes("drive"));
    const hasSheets = scopes.some((s) => s.includes("spreadsheets"));
    console.log(`   scopes: ${scopes.join(" ") || "(없음)"}`);
    console.log(`   drive=${hasDrive ? "✓" : "✗"}  sheets=${hasSheets ? "✓" : "✗"}`);
    if (!hasSheets) {
        console.log("   ⚠️ spreadsheets 스코프 없음 — `pnpm --filter @trade-data-manager/google login` 재실행 필요");
    }
}

main().catch((err) => {
    console.error("❌ auth 스모크 실패:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
