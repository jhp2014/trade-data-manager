import { describe, it, expect } from "vitest";
import type { NewsItem } from "#domain";
import type { NewsChannelSearch, NewsChannelSearchQuery } from "#port/outbound";
import { NewsSearchService } from "../newsSearchService.js";

const hit = (channel: string, iso: string, text = "t"): NewsItem => ({
    source: "telegram",
    channel,
    at: new Date(iso),
    text,
    ref: `${channel}#${iso}`,
});

/** 채널별 결과를 미리 정해두고 돌려주는 가짜 포트. 호출된 channel 도 기록. */
function fakeSource(
    byChannel: Record<string, NewsItem[]>,
    onCall?: (q: NewsChannelSearchQuery) => void,
): NewsChannelSearch {
    return {
        async search(_query, opts) {
            onCall?.(opts);
            const items = byChannel[opts.channel];
            if (items === undefined) throw new Error(`boom:${opts.channel}`);
            return items;
        },
    };
}

describe("NewsSearchService", () => {
    it("여러 방 fan-out 결과를 최신순(at desc)으로 합친다", async () => {
        const source = fakeSource({
            a: [hit("a", "2026-06-29T01:00:00Z"), hit("a", "2026-06-29T05:00:00Z")],
            b: [hit("b", "2026-06-29T03:00:00Z")],
        });
        const items = await new NewsSearchService({ source, channels: ["a", "b"] }).search("q");

        expect(items.map((i) => i.at.toISOString())).toEqual([
            "2026-06-29T05:00:00.000Z",
            "2026-06-29T03:00:00.000Z",
            "2026-06-29T01:00:00.000Z",
        ]);
    });

    it("한 방 실패는 격리 — 나머지 방 결과는 그대로, onError 통지", async () => {
        const failed: string[] = [];
        const source = fakeSource(
            { ok: [hit("ok", "2026-06-29T01:00:00Z")] }, // "bad" 는 미정의 → throw
        );
        const items = await new NewsSearchService({
            source,
            channels: ["ok", "bad"],
            onError: (channel) => failed.push(channel),
        }).search("q");

        expect(items).toHaveLength(1);
        expect(items[0].channel).toBe("ok");
        expect(failed).toEqual(["bad"]);
    });

    it("옵션(since/until/limitPerChannel)을 채널 질의로 전달", async () => {
        const calls: NewsChannelSearchQuery[] = [];
        const source = fakeSource({ a: [] }, (q) => calls.push(q));
        const since = new Date("2026-06-01T00:00:00Z");
        await new NewsSearchService({ source, channels: ["a"] }).search("q", {
            since,
            limitPerChannel: 20,
        });
        expect(calls[0]).toEqual({ channel: "a", since, until: undefined, limit: 20 });
    });
});
