// infra/broker/news/telegramHistoryAdapter — Telegram 히스토리 순회를 ChannelHistorySource 로.
// 리치 메시지(TelegramHistoryMessage)를 도메인 ChannelMessage 로 매핑할 뿐 — 페이지·FLOOD·재접속은 infra/telegram 몫.
// channelId 는 호출자가 resolve 로 얻은 ChannelInfo 에서 받는다(메시지 자체엔 방 id 가 없다).
import type {
    ChannelHistoryPage,
    ChannelHistoryQuery,
    ChannelHistorySource,
    ChannelInfo,
    ChannelMessage,
} from "@trade-data-manager/market";
import type {
    TelegramChannelInfo,
    TelegramHistoryMessage,
    TelegramHistoryOptions,
    TelegramHistoryPage,
} from "@trade-data-manager/telegram";

/** 어댑터가 필요로 하는 최소 표면(테스트 스텁 주입 가능). Telegram 이 구조적으로 만족. */
export interface TelegramHistorySource {
    historyPage(peer: string, opts?: TelegramHistoryOptions): Promise<TelegramHistoryPage>;
    resolveChannel(peer: string): Promise<TelegramChannelInfo>;
}

export function telegramToChannelMessage(channelId: number, m: TelegramHistoryMessage): ChannelMessage {
    return {
        channelId,
        msgId: m.id,
        postedAt: m.date,
        editedAt: m.editDate,
        text: m.text,
        entities: m.entities,
        webpage: m.webpage,
        fwd: m.fwd,
        replyToMsgId: m.replyToMsgId,
        groupedId: m.groupedId,
        mediaKind: m.mediaKind,
        photoId: m.photoId,
        raw: m.raw,
    };
}

export class TelegramHistoryAdapter implements ChannelHistorySource {
    constructor(private readonly tg: TelegramHistorySource) {}

    async resolve(peer: string): Promise<ChannelInfo> {
        const info = await this.tg.resolveChannel(peer);
        return { channelId: info.channelId, peer, username: info.username, title: info.title };
    }

    async page(channel: ChannelInfo, query: ChannelHistoryQuery): Promise<ChannelHistoryPage> {
        const page = await this.tg.historyPage(channel.peer, { offsetId: query.offsetId });
        return {
            pageIds: page.pageIds,
            messages: page.messages.map((m) => telegramToChannelMessage(channel.channelId, m)),
        };
    }
}
