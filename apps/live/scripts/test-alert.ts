// 알람 텔레그램 배선 수동 테스트 — 실제 발화 경로(buildFiringMessages→notifier)를 가짜 발화 1건으로
// 태운다. 전송로는 모듈과 동일한 env 선택(createAlertNotifierFromEnv: bot=Bot API/ntfy/user=MTProto).
// HTML 이스케이프·답장(replyTo)까지 실전송으로 확인한다 — 이스케이프가 깨지면 Bot API 가 400 을 던진다.
//   실행: pnpm --filter @trade-data-manager/live exec tsx scripts/test-alert.ts
import "dotenv/config";
import { createAlertNotifierFromEnv } from "../src/live/alerts/createNotifier.js";
import { buildFiringMessages } from "../src/live/alerts/format.js";

const made = createAlertNotifierFromEnv();
if (!made) {
    console.error("❌ 알림 전송 미설정 — apps/live/.env 의 LIVE_NOTIFY_TRANSPORT/LIVE_TELEGRAM_* 확인");
    process.exit(1);
}
console.log(`전송로: ${made.label}`);

const now = Date.now();
const [msg] = buildFiringMessages([
    {
        ruleId: "test",
        code: "005930",
        name: "삼성전자",
        at: now,
        features: { price: 71_000, changeRate: 2.1 },
        note: "배선 테스트 — 실제 알람 아님",
    },
]);

const anchor = await made.notifier.send(msg);
console.log(`발화 전송 완료(message_id=${anchor ?? "미지원"})`);

// 컨텍스트 후속 — 답장으로 묶이는지 + 이스케이프(<, &)가 400 을 안 내는지 실전송 확인.
await made.notifier.send({
    kind: "context",
    priority: "min",
    replyTo: anchor ?? undefined,
    blocks: [
        { kind: "text", text: '이스케이프 확인: <급등> & "특징주"' },
        { kind: "pre", text: "1. SK하이닉스  +15.20%  892억\n2. 한미반도체  +11.40%  310억" },
        { kind: "link", text: "링크 확인", url: "https://example.com/?a=1&b=2" },
    ],
});
await made.notifier.close?.();
console.log("✅ 전송 완료 — 채널을 확인하세요(후속이 답장으로 붙었는지, 서식이 깨지지 않았는지)");
process.exit(0);
