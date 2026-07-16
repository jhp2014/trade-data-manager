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
// 실제 발화 모양 그대로 — 구조화 근거(가격·순위) + 테마 미니 보드. 서버가 이걸 HTML 로 flatten 한다.
// 뉴스 제목류 이스케이프(<, &)가 400 을 내지 않는지도 이 경로로 확인(종목명·테마명에 특수문자 포함).
const [msg] = buildFiringMessages([
    {
        ruleId: "test",
        code: "005930",
        name: "삼성전자",
        at: now,
        features: { price: 71_000, changeRate: 2.1 },
        evidence: [
            { kind: "rank", theme: "반도체 <급등>", market: "un", mode: "reach", rank: 3, past: 7, threshold: 3 },
            { kind: "price", op: "gte", price: 71_000, value: 70_000 },
        ],
        themeContext: {
            chips: ["반도체 <급등>", "AI & 로봇"],
            boards: [
                {
                    theme: "반도체 <급등>",
                    members: [
                        { code: "000660", name: "SK하이닉스", rateUn: 15.2, rateKrx: 14.9, rank: 1, tradeValue: 89_200, themes: ["반도체 <급등>", "HBM"], isSelf: false },
                        { code: "042700", name: "한미반도체", rateUn: 12.1, rateKrx: 11.8, rank: 2, tradeValue: 31_000, themes: ["반도체 <급등>"], isSelf: false },
                        { code: "005930", name: "삼성전자", rateUn: 2.1, rateKrx: 1.8, rank: 3, tradeValue: 120_300, themes: ["반도체 <급등>", "AI & 로봇"], isSelf: true },
                    ],
                },
            ],
        },
        note: "배선 테스트 — 실제 알람 아님",
    },
]);

const anchor = await made.notifier.send(msg);
console.log(`발화 전송 완료(message_id=${anchor ?? "미지원"})`);
await made.notifier.close?.();
console.log("✅ 전송 완료 — 채널을 확인하세요(근거·테마 보드가 실렸는지, <·& 이스케이프로 서식이 안 깨졌는지)");
process.exit(0);
