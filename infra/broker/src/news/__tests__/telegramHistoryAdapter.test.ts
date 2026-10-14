import { describe, it, expect } from "vitest";
import type { TelegramHistoryMessage, TelegramHistoryOptions } from "@trade-data-manager/telegram";
import { TelegramHistoryAdapter, type TelegramHistorySource } from "../telegramHistoryAdapter.js";

const hm = (id: number, over: Partial<TelegramHistoryMessage> = {}): TelegramHistoryMessage => ({
    id,
    date: new Date(Date.UTC(2026, 9, 13, 0, id)),
    text: `t${id}`,
    entities: [],
    mediaKind: "none",
    raw: { id },
    ...over,
});

function fakeTg(pages: Record<string, { ids: number[]; msgs: TelegramHistoryMessage[] }>, calls: TelegramHistoryOptions[] = []) {
    const tg: TelegramHistorySource = {
        async resolveChannel(peer) {
            return { channelId: 1566756459, username: peer.replace("@", ""), title: "머니서퍼" };
        },
        async historyPage(_peer, opts) {
            calls.push(opts ?? {});
            const p = pages[String(opts?.offsetId ?? "")] ?? { ids: [], msgs: [] };
            return { pageIds: p.ids, messages: p.msgs };
        },
    };
    return { tg, calls };
}

describe("TelegramHistoryAdapter", () => {
    it("resolve → ChannelInfo(peer 는 레지스트리 키 그대로)", async () => {
        const { tg } = fakeTg({});
        const info = await new TelegramHistoryAdapter(tg).resolve("@moneythemestock");
        expect(info).toEqual({ channelId: 1566756459, peer: "@moneythemestock", username: "moneythemestock", title: "머니서퍼" });
    });

    it("page → pageIds 보존 + 메시지에 channelId 를 찍어 ChannelMessage 로", async () => {
        const rich = hm(10, {
            editDate: new Date("2026-10-13T01:00:00Z"),
            entities: [{ type: "TextUrl", offset: 0, length: 2, url: "https://n.com" }],
            webpage: { title: "제목", url: "https://n.com" },
            fwd: { channelId: 7, msgId: 3 },
            groupedId: "99",
            mediaKind: "photo",
            photoId: "5",
        });
        const { tg, calls } = fakeTg({ "": { ids: [10, 9], msgs: [rich] }, "9": { ids: [], msgs: [] } });
        const adapter = new TelegramHistoryAdapter(tg);
        const info = await adapter.resolve("@x");
        const page = await adapter.page(info, { offsetId: undefined });
        expect(page.pageIds).toEqual([10, 9]);
        expect(page.messages).toEqual([
            {
                channelId: 1566756459,
                msgId: 10,
                postedAt: rich.date,
                editedAt: rich.editDate,
                text: "t10",
                entities: rich.entities,
                webpage: rich.webpage,
                fwd: rich.fwd,
                replyToMsgId: undefined,
                groupedId: "99",
                mediaKind: "photo",
                photoId: "5",
                raw: { id: 10 },
            },
        ]);
        await adapter.page(info, { offsetId: 9 });
        expect(calls).toEqual([{ offsetId: undefined }, { offsetId: 9 }]);
    });
});
