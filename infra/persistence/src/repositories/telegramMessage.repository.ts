// 텔레그램 뉴스 방 아카이브 리포지토리 — ChannelMessageStore(수집: 멱등 upsert·범위·커서) + ChannelMessageReader(검색·coverage).
// 덮어쓰기 규칙(SQL 로 강제): 같은 (channel_id, msg_id) 는 ① edited_at 이 달라졌거나 ② 비어 있던 링크 미리보기가
// 채워진 경우에만 갱신한다. ②가 필요한 이유: 게시 직후엔 미리보기가 pending 이라 wp_* 가 비는데, 나중에 채워져도
// edit_date 는 안 바뀐다. 그 밖(같은 내용 재수집)은 건드리지 않는다 — raw·검색 컬럼이 헛되이 다시 쓰이지 않게.
import { and, asc, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from "drizzle-orm";
import type {
    ArchiveCoverage,
    ArchivedMessage,
    ChannelBounds,
    ChannelCursor,
    ChannelInfo,
    ChannelMessage,
    ChannelMessageQuery,
    ChannelMessageReader,
    ChannelMessageStore,
} from "@trade-data-manager/market";
import type { Database } from "../db.js";
import { telegramChannel, telegramMessage } from "../schema/market.js";
import { channelMessageToRow, rowToChannelMessage } from "../mappers/telegramMessage.js";
import { buildConflictUpdateSet, escapeLike } from "./_helpers.js";

// ⚠ search_text 는 생성 컬럼 — SET 에 들어가면 PG 가 거부한다.
const CONFLICT_SET = buildConflictUpdateSet(telegramMessage, ["channelId", "msgId", "searchText"]);
// ON CONFLICT 의 WHERE 에선 대상 테이블을 이름으로 가리킨다(스키마 접두 없이).
const OVERWRITE_WHEN = sql.raw(
    `"telegram_message"."edited_at" IS DISTINCT FROM EXCLUDED."edited_at"` +
        ` OR ("telegram_message"."wp_url" IS NULL AND EXCLUDED."wp_url" IS NOT NULL)`,
);
/** 한 INSERT 의 행 수 상한 — raw 가 행당 수 KB 라 파라미터·패킷을 적당히 끊는다. */
const CHUNK = 200;

const DEFAULT_SEARCH_LIMIT = 5000;

export class DrizzleTelegramMessageRepository implements ChannelMessageStore, ChannelMessageReader {
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

    // ── ChannelMessageReader ──

    /** 토큰 전부 ILIKE AND(search_text — pg_trgm GIN 이 받는다) × 시각 창, posted_at 내림차순. */
    async searchMessages(q: ChannelMessageQuery): Promise<ArchivedMessage[]> {
        if (q.peers.length === 0) return [];
        const conds: SQL[] = [inArray(telegramChannel.peer, [...q.peers])];
        if (q.since) conds.push(gte(telegramMessage.postedAt, q.since));
        if (q.until) conds.push(lte(telegramMessage.postedAt, q.until));
        // 행 비교 — posted_at 인덱스를 타고 정렬 키와 같은 순서라 커서 경계가 빈틈없이 맞는다.
        if (q.before) {
            conds.push(sql`(${telegramMessage.postedAt}, ${telegramMessage.msgId}) < (${q.before.postedAt}, ${q.before.msgId})`);
        }
        for (const t of q.tokens) conds.push(ilike(telegramMessage.searchText, `%${escapeLike(t)}%`));
        const rows = await this.db
            .select({ m: telegramMessage, peer: telegramChannel.peer })
            .from(telegramMessage)
            .innerJoin(telegramChannel, eq(telegramChannel.channelId, telegramMessage.channelId))
            .where(and(...conds))
            .orderBy(desc(telegramMessage.postedAt), desc(telegramMessage.msgId))
            .limit(q.limit ?? DEFAULT_SEARCH_LIMIT);
        return rows.map((r) => ({ ...rowToChannelMessage(r.m), peer: r.peer }));
    }

    /**
     * from = 방별 "가장 오래된 메시지" posted_at 의 max · to = 방별 synced_at 의 min · channels = sync 완주 방 수.
     * peers 중 하나라도 synced_at 이 없거나 행이 없으면 null(아직 전부 라이브) — 판정은 domain isDayCovered.
     * 방별 최과거는 msg_id 단조 증가를 믿고 PK 로 1행만 읽는다(min(posted_at) GROUP BY 는 매 요청 49만 행 seq scan).
     */
    async coverage(peers: readonly string[]): Promise<ArchiveCoverage | null> {
        if (peers.length === 0) return null;
        const channels = await this.db
            .select({ channelId: telegramChannel.channelId, syncedAt: telegramChannel.syncedAt })
            .from(telegramChannel)
            .where(inArray(telegramChannel.peer, [...peers]));
        if (channels.length < peers.length) return null;
        let to: Date | null = null;
        let from: Date | null = null;
        for (const c of channels) {
            if (c.syncedAt === null) return null;
            if (to === null || c.syncedAt.getTime() < to.getTime()) to = c.syncedAt;
            const [oldest] = await this.db
                .select({ postedAt: telegramMessage.postedAt })
                .from(telegramMessage)
                .where(eq(telegramMessage.channelId, c.channelId))
                .orderBy(asc(telegramMessage.msgId))
                .limit(1);
            if (!oldest) return null;
            if (from === null || oldest.postedAt.getTime() > from.getTime()) from = oldest.postedAt;
        }
        if (to === null || from === null) return null;
        return { from, to, channels: channels.length };
    }
}
