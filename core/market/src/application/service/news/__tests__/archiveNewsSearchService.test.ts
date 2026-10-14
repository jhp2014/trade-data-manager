import { describe, it, expect } from "vitest";
import type { ArchivedMessage, ChannelMessageQuery, ChannelMessageReader } from "#port/query";
import { ArchiveNewsSearchService, encodeCursor, parseCursor, tokenizeQuery } from "../archiveNewsSearchService.js";

const row = (msgId: number, over: Partial<ArchivedMessage> = {}): ArchivedMessage => ({
    channelId: 1,
    msgId,
    peer: "@c",
    postedAt: new Date(Date.UTC(2026, 9, 12, 1, msgId)),
    text: `본문 ${msgId}`,
    entities: [],
    mediaKind: "none",
    raw: {},
    ...over,
});

function fakeReader(rows: ArchivedMessage[], seen: ChannelMessageQuery[] = []): ChannelMessageReader {
    return {
        async searchMessages(q) {
            seen.push(q);
            // before 커서는 msgId 로만 흉내(테스트 행은 msgId 순 = 시각 순).
            const below = q.before ? rows.filter((r) => r.msgId < q.before!.msgId) : rows;
            return q.limit !== undefined ? below.slice(0, q.limit) : below;
        },
        async coverage() {
            return null;
        },
    };
}

describe("ArchiveNewsSearchService", () => {
    it("질의를 토큰 AND 로 넘기고 NewsItem(표시명·ref·links)으로 매핑한다", async () => {
        const seen: ChannelMessageQuery[] = [];
        const rows = [
            row(2, { entities: [{ type: "TextUrl", offset: 0, length: 2, url: "https://n.com/2" }] }),
            row(1, { text: "https://a.b/c", webpage: { title: "제목만", url: "https://a.b/c" } }),
            row(0, { text: "", mediaKind: "photo" }),
        ];
        const svc = new ArchiveNewsSearchService({ reader: fakeReader(rows, seen), labels: new Map([["@c", "방"]]) });
        const since = new Date("2026-10-11T15:00:00Z");
        const items = await svc.search("삼성 전자", { since });

        expect(seen[0]).toEqual({ peers: ["@c"], tokens: ["삼성", "전자"], since, until: undefined, limit: 5000 });
        expect(items).toEqual([
            {
                source: "telegram",
                channel: "방",
                at: rows[0].postedAt,
                text: "본문 2",
                url: undefined,
                ref: "@c#2",
                links: [{ offset: 0, length: 2, url: "https://n.com/2" }],
            },
            {
                source: "telegram",
                channel: "방",
                at: rows[1].postedAt,
                text: "제목만",
                url: "https://a.b/c",
                ref: "@c#1",
                preview: { title: "제목만" },
            },
        ]);
    });

    it("searchPage — limit+1 로 읽어 더 있으면 마지막 항목의 커서를 nextBefore 로, 아니면 생략", async () => {
        const seen: ChannelMessageQuery[] = [];
        const rows = [row(3), row(2), row(1)];
        const svc = new ArchiveNewsSearchService({ reader: fakeReader(rows, seen), labels: new Map() });
        const p1 = await svc.searchPage("", { limit: 2 });
        expect(p1.items.map((i) => i.ref)).toEqual(["@c#3", "@c#2"]);
        expect(p1.nextBefore).toBe(encodeCursor({ postedAt: rows[1].postedAt, msgId: 2 }));
        expect(seen[0]).toMatchObject({ tokens: [], limit: 3, before: undefined });

        const p2 = await svc.searchPage("", { limit: 2, before: p1.nextBefore });
        expect(seen[1].before).toEqual({ postedAt: rows[1].postedAt, msgId: 2 });
        expect(p2.items.map((i) => i.ref)).toEqual(["@c#1"]);
        expect(p2.nextBefore).toBeUndefined();
        const p3 = await svc.searchPage("", { limit: 5 });
        expect(p3.items).toHaveLength(3);
        expect(p3.nextBefore).toBeUndefined();
        await expect(svc.searchPage("", { limit: 2, before: "garbage" })).rejects.toThrow("잘못된 before");
    });

    it("커서 encode/parse 왕복, 깨진 커서는 null", () => {
        const c = { postedAt: new Date("2026-10-12T01:02:03.000Z"), msgId: 77 };
        expect(parseCursor(encodeCursor(c))).toEqual(c);
        expect(parseCursor("nohash")).toBeNull();
        expect(parseCursor("not-a-date#1")).toBeNull();
        expect(parseCursor("2026-10-12T01:02:03.000Z#x")).toBeNull();
    });

    it("tokenizeQuery — 공백 분리, 빈 질의는 빈 배열(피드)", () => {
        expect(tokenizeQuery("  삼성전자   신고가 ")).toEqual(["삼성전자", "신고가"]);
        expect(tokenizeQuery("")).toEqual([]);
    });
});
