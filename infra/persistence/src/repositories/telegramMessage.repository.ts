// 텔레그램 뉴스 방 아카이브 리포지토리 — ChannelMessageStore(수집: 멱등 upsert·범위·커서) 구현.
// 덮어쓰기 규칙(SQL 로 강제): 같은 (channel_id, msg_id) 는 ① edited_at 이 달라졌거나 ② 비어 있던 링크 미리보기가
// 채워진 경우에만 갱신한다. ②가 필요한 이유: 게시 직후엔 미리보기가 pending 이라 wp_* 가 비는데, 나중에 채워져도
// edit_date 는 안 바뀐다. 그 밖(같은 내용 재수집)은 건드리지 않는다 — raw·검색 컬럼이 헛되이 다시 쓰이지 않게.
import { eq, sql } from "drizzle-orm";
import type { ChannelBounds, ChannelCursor, ChannelInfo, ChannelMessage, ChannelMessageStore } from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { telegramChannel, telegramMessage } from "../schema/market.js";
import { channelMessageToRow } from "../mappers/telegramMessage.js";
import { buildConflictUpdateSet } from "./_helpers.js";

// ⚠ search_text 는 생성 컬럼 — SET 에 들어가면 PG 가 거부한다.
const CONFLICT_SET = buildConflictUpdateSet(telegramMessage, ["channelId", "msgId", "searchText"]);
// ON CONFLICT 의 WHERE 에선 대상 테이블을 이름으로 가리킨다(스키마 접두 없이).
const OVERWRITE_WHEN = sql.raw(
    `"telegram_message"."edited_at" IS DISTINCT FROM EXCLUDED."edited_at"` +
        ` OR ("telegram_message"."wp_url" IS NULL AND EXCLUDED."wp_url" IS NOT NULL)`,
);
/** 한 INSERT 의 행 수 상한 — raw 가 행당 수 KB 라 파라미터·패킷을 적당히 끊는다. */
const CHUNK = 200;

export class DrizzleTelegramMessageRepository implements ChannelMessageStore {
    constructor(private readonly db: Database) {}

    async upsertChannel(info: ChannelInfo): Promise<void> {
        // 커서(synced_*)는 건드리지 않는다 — 정체만 갱신.
        await this.db
            .insert(telegramChannel)
            .values({ channelId: info.channelId, peer: info.peer, username: info.username ?? null, title: info.title })
            .onConflictDoUpdate({
                target: telegramChannel.channelId,
                set: { peer: info.peer, username: info.username ?? null, title: info.title },
            });
    }

    async saveMessages(messages: ChannelMessage[]): Promise<void> {
        if (messages.length === 0) return;
        // 배치 안 PK 중복 제거(뒤가 이김) — 같은 행을 한 문장에서 두 번 건드리면 PG 가 거부한다.
        const byKey = new Map<string, ReturnType<typeof channelMessageToRow>>();
        for (const m of messages) byKey.set(`${m.channelId}|${m.msgId}`, channelMessageToRow(m));
        const rows = [...byKey.values()];
        for (let i = 0; i < rows.length; i += CHUNK) {
            await this.db
                .insert(telegramMessage)
                .values(rows.slice(i, i + CHUNK))
                .onConflictDoUpdate({
                    target: [telegramMessage.channelId, telegramMessage.msgId],
                    set: CONFLICT_SET,
                    setWhere: OVERWRITE_WHEN,
                });
        }
    }

    async bounds(channelId: number): Promise<ChannelBounds | null> {
        const [r] = await this.db
            .select({
                minId: sql<number | null>`min(${telegramMessage.msgId})`,
                maxId: sql<number | null>`max(${telegramMessage.msgId})`,
                minPostedAt: sql<Date | string | null>`min(${telegramMessage.postedAt})`,
            })
            .from(telegramMessage)
            .where(eq(telegramMessage.channelId, channelId));
        if (!r || r.minId === null || r.maxId === null || r.minPostedAt === null) return null;
        return { minId: r.minId, maxId: r.maxId, minPostedAt: new Date(r.minPostedAt) };
    }

    async cursor(channelId: number): Promise<ChannelCursor> {
        const [r] = await this.db
            .select({ syncedMaxId: telegramChannel.syncedMaxId, syncedAt: telegramChannel.syncedAt })
            .from(telegramChannel)
            .where(eq(telegramChannel.channelId, channelId));
        return { syncedMaxId: r?.syncedMaxId ?? null, syncedAt: r?.syncedAt ?? null };
    }

    async markSynced(channelId: number, maxId: number, at: Date): Promise<void> {
        await this.db
            .update(telegramChannel)
            .set({ syncedMaxId: maxId, syncedAt: at })
            .where(eq(telegramChannel.channelId, channelId));
    }
}
