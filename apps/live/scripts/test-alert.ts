// 알람 텔레그램 배선 수동 테스트 — 실제 발화 경로(buildAlertMessages→notifier)를 가짜 발화 1건으로
// 태운다. 전송로는 모듈과 동일한 env 선택(createAlertNotifierFromEnv: bot=Bot API/user=MTProto).
//   실행: pnpm --filter @trade-data-manager/live exec tsx scripts/test-alert.ts
import "dotenv/config";
import { createAlertNotifierFromEnv } from "../src/live/alerts/createNotifier.js";

const made = createAlertNotifierFromEnv();
if (!made) {
    console.error("❌ 텔레그램 전송 미설정 — apps/live/.env 의 LIVE_TELEGRAM_* 확인");
    process.exit(1);
}
console.log(`전송로: ${made.label}`);

await made.notifier.send([
    {
        ruleId: "test",
        code: "005930",
        name: "삼성전자",
        at: Date.now(),
        features: { price: 71_000, changeRate: 2.1 },
        note: "배선 테스트 — 실제 알람 아님",
    },
]);
await made.notifier.close?.();
console.log("✅ 전송 완료 — 채널을 확인하세요");
process.exit(0);
