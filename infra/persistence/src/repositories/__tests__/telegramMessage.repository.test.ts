import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { ChannelInfo, ChannelMessage } from "@trade-data-manager/market";
import { createTestDb, type TestDb } from "../../test-support/testDb.js";
import { telegramMessage } from "../../schema/market.js";
import { DrizzleTelegramMessageRepository } from "../telegramMessage.repository.js";
import { rowToChannelMessage } from "../../mappers/telegramMessage.js";

const CH = 1566756459;
const INFO: ChannelInfo = { channelId: CH, peer: "@moneythemestock", username: "moneythemestock", title: "머니서퍼" };

function msg(msgId: number, over: Partial<ChannelMessage> = {}): ChannelMessage {
    return {
        channelId: CH,
        msgId,
        postedAt: new Date(Date.UTC(2026, 9, 13, 0, msgId)),
        text: `본문 ${msgId}`,
        entities: [],
        mediaKind: "none",
        raw: { className: "Message", id: msgId },
        ...over,
    };
}

describe("DrizzleTelegramMessageRepository (pglite)", () => {
    let t: TestDb;
    let repo: DrizzleTelegramMessageRepository;

    beforeAll(async () => {
        t = await createTestDb();
        repo = new DrizzleTelegramMessageRepository(t.db);
        await repo.upsertChannel(INFO);
    });
    afterAll(() => t.close());

    async function rowOf(msgId: number) {
        const [r] = await t.db
            .select()
            .from(telegramMessage)
            .where(and(eq(telegramMessage.channelId, CH), eq(telegramMessage.msgId, msgId)));
        return r;
    }

    it("리치 필드가 왕복한다(entities jsonb · 미리보기 · 전달 · 앨범/사진 bigint · raw)", async () => {
        const m = msg(1, {
            editedAt: new Date("2026-10-13T01:00:00Z"),
            entities: [{ type: "TextUrl", offset: 0, length: 2, url: "https://n.com/a" }],
            webpage: { url: "https://n.com/a", title: "제목", description: "설명", siteName: "Naver" },
            fwd: { channelId: 99, msgId: 7, date: new Date("2026-10-12T00:00:00Z") },
            replyToMsgId: 0,
            groupedId: "13838493720000001", // TL long(signed int64) — bigint 범위 안
            mediaKind: "photo",
            photoId: "6203495874729857293",
        });
        await repo.saveMessages([m]);
        const back = rowToChannelMessage(await rowOf(1));
        expect(back).toEqual({ ...m, replyToMsgId: 0 });
    });

    it("search_text 생성 컬럼 = 본문 + 미리보기 제목 + 설명", async () => {
        const r = await rowOf(1);
        expect(r.searchText).toBe("본문 1\n제목\n설명");
    });

    it("같은 내용 재수집은 덮어쓰지 않고, edited_at 이 바뀌면 덮어쓴다", async () => {
        await repo.saveMessages([msg(2, { text: "v1" })]);
        await repo.saveMessages([msg(2, { text: "v2(같은 edited_at)" })]);
        expect((await rowOf(2)).text).toBe("v1");
        await repo.saveMessages([msg(2, { text: "v3", editedAt: new Date("2026-10-13T02:00:00Z") })]);
        expect((await rowOf(2)).text).toBe("v3");
    });

    it("pending 이던 링크 미리보기가 채워지면 edited_at 이 같아도 덮어쓴다", async () => {
        await repo.saveMessages([msg(3, { text: "https://x.y/z" })]);
        await repo.saveMessages([msg(3, { text: "https://x.y/z", webpage: { url: "https://x.y/z", title: "채워짐" } })]);
        const r = await rowOf(3);
        expect(r.wpTitle).toBe("채워짐");
        expect(r.searchText).toContain("채워짐");
        // 이미 채워진 뒤의 같은 내용은 다시 안 쓴다.
        await repo.saveMessages([msg(3, { text: "다른 본문", webpage: { url: "https://x.y/z", title: "두 번째" } })]);
        expect((await rowOf(3)).wpTitle).toBe("채워짐");
    });

    it("배치 안 PK 중복은 뒤가 이기고 한 문장에서 터지지 않는다", async () => {
        await repo.saveMessages([msg(4, { text: "a" }), msg(4, { text: "b" })]);
        expect((await rowOf(4)).text).toBe("b");
    });

    it("bounds / cursor / markSynced 왕복, upsertChannel 재호출이 커서를 안 지운다", async () => {
        const b = await repo.bounds(CH);
        expect(b).toEqual({ minId: 1, maxId: 4, minPostedAt: msg(1).postedAt });
        expect(await repo.bounds(42)).toBeNull();

        expect(await repo.cursor(CH)).toEqual({ syncedMaxId: null, syncedAt: null });
        const at = new Date("2026-10-14T11:30:00Z");
        await repo.markSynced(CH, 4, at);
        expect(await repo.cursor(CH)).toEqual({ syncedMaxId: 4, syncedAt: at });
        await repo.upsertChannel({ ...INFO, title: "개명" });
        expect(await repo.cursor(CH)).toEqual({ syncedMaxId: 4, syncedAt: at });
        expect(await repo.cursor(42)).toEqual({ syncedMaxId: null, syncedAt: null });
    });

    it("searchMessages — 토큰 AND 부분일치(미리보기 제목 포함) × 시각 창, 최신순, peer 조인", async () => {
        await repo.saveMessages([
            msg(20, { text: "https://x/1", webpage: { url: "https://x/1", title: "삼성전자 신고가 돌파" } }),
            msg(21, { text: "LG전자 실적" }),
            msg(22, { text: "삼성전자 하락" }),
        ]);
        const PEERS = [INFO.peer];
        const hits = await repo.searchMessages({ peers: PEERS, tokens: ["전자", "삼성"] });
        expect(hits.map((h) => h.msgId)).toEqual([22, 20]); // 미리보기 제목으로도 걸리고, 최신순
        expect(hits[0].peer).toBe("@moneythemestock");
        const windowed = await repo.searchMessages({ peers: PEERS, tokens: [], since: msg(21).postedAt, until: msg(22).postedAt });
        expect(windowed.map((h) => h.msgId)).toEqual([22, 21]);
        // LIKE 메타문자는 글자로 · 레지스트리 밖 방은 안 섞인다
        expect(await repo.searchMessages({ peers: PEERS, tokens: ["100%"] })).toEqual([]);
        expect(await repo.searchMessages({ peers: ["@nobody"], tokens: [] })).toEqual([]);
        // before 커서 = (posted_at, msg_id) 엄격 과거. 같은 시각이면 msg_id 로 가른다.
        const sameTime = msg(22).postedAt;
        await repo.saveMessages([msg(23, { postedAt: sameTime, text: "동시각" })]);
        const page = await repo.searchMessages({ peers: PEERS, tokens: [], before: { postedAt: sameTime, msgId: 23 }, limit: 2 });
        expect(page.map((h) => h.msgId)).toEqual([22, 21]);
    });

    it("coverage — 전 방 sync 완주 전엔 null, 뒤엔 from=min(posted) 의 max · to=min(synced_at)", async () => {
        const other: ChannelInfo = { channelId: 2, peer: "@other", title: "다른 방" };
        const PEERS = [INFO.peer, other.peer];
        await repo.upsertChannel(other);
        expect(await repo.coverage(PEERS)).toBeNull(); // @other 는 synced_at 없음
        expect(await repo.coverage([INFO.peer])).not.toBeNull(); // 레지스트리에서 @other 를 빼면 CH 만으로 판정
        await repo.saveMessages([{ ...msg(1), channelId: 2, msgId: 500, postedAt: new Date("2026-10-13T00:30:00Z") }]);
        const laterSync = new Date("2026-10-14T11:40:00Z");
        await repo.markSynced(2, 500, laterSync);
        const c = await repo.coverage(PEERS);
        // CH 의 최과거=msg(1) 00:01, other 의 최과거 = 00:30 → from = 00:30(max). to = min(synced) = CH 의 11:30.
        expect(c).toEqual({ from: new Date("2026-10-13T00:30:00Z"), to: new Date("2026-10-14T11:30:00Z"), channels: 2 });
        expect(await repo.coverage([...PEERS, "@unknown"])).toBeNull(); // 레지스트리에 있는데 DB 에 없는 방
    });

    it("pg_trgm 부분일치: 단어 중간('전자')으로도 잡힌다", async () => {
        await repo.saveMessages([msg(5, { text: "삼성전자 신고가" })]);
        const rows = await t.db
            .select({ msgId: telegramMessage.msgId })
            .from(telegramMessage)
            .where(sql`${telegramMessage.searchText} ILIKE ${"%전자%"}`);
        expect(rows.map((r) => r.msgId)).toContain(5);
        const [sim] = await t.db
            .select({ s: sql<number>`similarity('삼성전자', '삼성전자 신고가')` })
            .from(telegramMessage)
            .limit(1);
        expect(Number(sim.s)).toBeGreaterThan(0);
    });
});
