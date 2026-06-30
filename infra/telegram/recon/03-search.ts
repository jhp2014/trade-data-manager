// 정찰 3: 특정 방 안에서 키워드 검색(messages.search) — 한국어 검색 품질 실측.
// 사용: pnpm --filter @trade-data-manager/telegram recon:search <peer> <검색어> [limit]
//   peer: 공개방은 @username, 비공개방은 recon:dialogs 에서 본 id(숫자).
//   예: recon:search @some_stock_channel 삼성전자 30
import { connectedClient, saveExploration, argv, handleError } from "./_shared.js";

async function main() {
    const peerArg = argv(2, "");
    const query = argv(3, "");
    const limit = Number(argv(4, "30"));

    if (!peerArg || !query) {
        console.error("사용: recon:search <peer(@username|id)> <검색어> [limit]");
        process.exit(1);
    }

    // 숫자만이면 방 id(비공개) → Number 로, 아니면 @username 그대로.
    // 채널 id(-100… ~1e12)는 안전정수 범위 안이라 Number 로 충분. access_hash 는 세션 캐시에서 resolve.
    const peer: string | number = /^-?\d+$/.test(peerArg) ? Number(peerArg) : peerArg;

    const client = await connectedClient();

    // getMessages 에 search 를 주면 내부적으로 messages.search(방 단위)로 동작한다.
    const messages = await client.getMessages(peer, { search: query, limit });
    const rows = messages.map((m) => ({
        id: m.id,
        date: m.date ? new Date(m.date * 1000).toISOString() : null,
        senderId: m.senderId?.toString() ?? null,
        text: m.message ?? null,
    }));

    saveExploration({
        label: `search-${query}`,
        request: { peer: peerArg, query, limit },
        response: {
            count: rows.length,
            // 검색 품질 눈으로 보기: 본문에 검색어가 실제로 들어있나, 부분일치는 되나.
            sample: rows.slice(0, 10),
        },
        raw: rows,
    });

    await client.disconnect();
    process.exit(0);
}

main().catch(handleError);
