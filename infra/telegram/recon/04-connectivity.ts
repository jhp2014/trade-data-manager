// MTProto 연결성 확인 — 세션으로 접속만 해보고 끊는다(이 망에서 Bot API 가 IP 차단일 때 대체로 쓸 수 있는지).
//   실행: pnpm --filter @trade-data-manager/telegram exec tsx recon/04-connectivity.ts
import { createTelegram } from "../src/index.js";

const t0 = Date.now();
const tg = await createTelegram();
console.log(`✅ MTProto 접속 OK (${Date.now() - t0}ms) — GramJS 전송로 사용 가능`);
await tg.disconnect();
process.exit(0);
