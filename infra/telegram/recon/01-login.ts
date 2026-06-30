// 정찰 1: 최초 로그인 → 세션 문자열 발급.
// 사용: pnpm --filter @trade-data-manager/telegram recon:login
//   .env 에 API_ID/API_HASH/PHONE 만 채우고 실행 → 텔레그램 앱으로 온 코드(+2FA)를 콘솔에 입력.
//   성공하면 세션 문자열이 찍힌다 → .env 의 TELEGRAM_SESSION 에 붙여넣으면 이후 무인 접속.
import { loadConfig, buildClient, ask, handleError } from "./_shared.js";

async function main() {
    const cfg = loadConfig();
    if (cfg.session) {
        console.log(
            "ℹ️  이미 TELEGRAM_SESSION 이 설정돼 있습니다. 재로그인하려면 .env 에서 비우고 다시 실행하세요.",
        );
    }

    const client = buildClient(cfg, cfg.session);
    await client.start({
        phoneNumber: async () => cfg.phone,
        password: async () => cfg.password ?? (await ask("🔑 2FA 비밀번호: ")),
        phoneCode: async () => await ask("📲 텔레그램으로 받은 로그인 코드: "),
        onError: (err) => console.error("로그인 중 오류:", err),
    });

    const session = String(client.session.save());
    console.log("\n✅ 로그인 성공. 아래 문자열을 infra/telegram/.env 의 TELEGRAM_SESSION 에 붙여넣으세요:\n");
    console.log(session);
    console.log("\n⚠️  이 값은 내 계정 풀권한입니다 — 외부 노출 금지, 커밋 금지.");

    await client.disconnect();
    process.exit(0);
}

main().catch(handleError);
