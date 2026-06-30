// 정찰 2: 내 방 목록(getDialogs) — 채널/그룹 식별자(id·username·title) 실측.
// 사용: pnpm --filter @trade-data-manager/telegram recon:dialogs
//   여기서 확인한 username(공개) 또는 id(비공개)를 recon:search 의 peer 인자로 쓴다.
import { connectedClient, saveExploration, handleError } from "./_shared.js";

async function main() {
    const client = await connectedClient();

    const dialogs = await client.getDialogs({ limit: 200 });
    const rows = dialogs.map((d) => {
        const entity = d.entity as { username?: string } | undefined;
        return {
            id: d.id?.toString() ?? null,
            title: d.title ?? null,
            username: entity?.username ?? null, // 비공개 방은 null → id 로 지목해야 함
            isChannel: d.isChannel,
            isGroup: d.isGroup,
            isUser: d.isUser,
            unread: d.unreadCount,
        };
    });

    saveExploration({
        label: "dialogs",
        request: { limit: 200 },
        response: { count: rows.length, rows },
        raw: rows,
    });

    await client.disconnect();
    process.exit(0);
}

main().catch(handleError);
