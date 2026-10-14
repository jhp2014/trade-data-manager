import { describe, it, expect } from "vitest";
import type { ArchivedMessage, ChannelMessageQuery, ChannelMessageReader } from "#port/query";
import { ArchiveNewsSearchService, tokenizeQuery } from "../archiveNewsSearchService.js";

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
            return rows;
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

        expect(seen[0]).toEqual({ tokens: ["삼성", "전자"], since, until: undefined, limit: 5000 });
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
            { source: "telegram", channel: "방", at: rows[1].postedAt, text: "제목만", url: "https://a.b/c", ref: "@c#1" },
        ]);
    });

    it("tokenizeQuery — 공백 분리, 빈 질의는 빈 배열(피드)", () => {
        expect(tokenizeQuery("  삼성전자   신고가 ")).toEqual(["삼성전자", "신고가"]);
        expect(tokenizeQuery("")).toEqual([]);
    });
});
