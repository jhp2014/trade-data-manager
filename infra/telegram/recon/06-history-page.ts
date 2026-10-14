// 정찰 6: 운영 클라이언트의 historyPage 실측 — offsetId 경계(배타인가)·페이지 연속성·resolveChannel. 읽기 전용.
// 사용: pnpm --filter @trade-data-manager/telegram recon:history-page [peer] [limit]
import { createTelegram } from "../src/client.js";
import { NEWS_CHANNELS } from "../src/channels.js";
import { argv, handleError, saveExploration } from "./_shared.js";

async function main() {
    const peer = argv(2, NEWS_CHANNELS[0].peer);
    const limit = Number(argv(3, "20"));
    const tg = await createTelegram();
    try {
        const info = await tg.resolveChannel(peer);
        const p1 = await tg.historyPage(peer, { limit });
        const last1 = p1.pageIds[p1.pageIds.length - 1];
        const p2 = await tg.historyPage(peer, { limit, offsetId: last1 });
        const overlap = p2.pageIds.filter((id) => p1.pageIds.includes(id));
        saveExploration({
            label: "history-page",
            request: { peer, limit },
            response: {
                info,
                page1: { ids: p1.pageIds, msgs: p1.messages.length, newest: p1.messages[0]?.date, oldest: p1.messages.at(-1)?.date },
                page2: { ids: p2.pageIds, msgs: p2.messages.length },
                // 배타면 overlap 0 이고 page2 의 첫 id < last1.
                offsetIdExclusive: overlap.length === 0 && (p2.pageIds[0] ?? 0) < last1,
                sample: p1.messages[0],
            },
        });
    } finally {
        await tg.disconnect();
    }
    process.exit(0);
}

main().catch(handleError);
