// 도메인 ChannelMessage ↔ telegram_message 행 매퍼. 중첩(webpage·fwd) ↔ 평탄(wp_*·fwd_*), int64 문자열 ↔ bigint.
// raw 는 불투명 jsonb 로 그대로. search_text 는 생성 컬럼이라 쓰기 쪽엔 없다.
import type { ChannelMessage, ChannelMediaKind } from "@trade-data-manager/market";
import type { TelegramMessageInsert, TelegramMessageRow } from "../schema/market.js";

export function channelMessageToRow(m: ChannelMessage): TelegramMessageInsert {
    return {
        channelId: m.channelId,
        msgId: m.msgId,
        postedAt: m.postedAt,
        editedAt: m.editedAt ?? null,
        text: m.text,
        entities: m.entities,
        wpUrl: m.webpage?.url ?? null,
        wpTitle: m.webpage?.title ?? null,
        wpDescription: m.webpage?.description ?? null,
        wpSite: m.webpage?.siteName?.slice(0, 120) ?? null,
        fwdChannelId: m.fwd?.channelId ?? null,
        fwdMsgId: m.fwd?.msgId ?? null,
        fwdFromName: m.fwd?.fromName ?? null,
        fwdPostedAt: m.fwd?.date ?? null,
        replyToMsgId: m.replyToMsgId ?? null,
        groupedId: m.groupedId !== undefined ? BigInt(m.groupedId) : null,
        mediaKind: m.mediaKind,
        photoId: m.photoId !== undefined ? BigInt(m.photoId) : null,
        raw: m.raw ?? {},
    };
}

export function rowToChannelMessage(r: TelegramMessageRow): ChannelMessage {
    const hasWp = r.wpUrl !== null || r.wpTitle !== null || r.wpDescription !== null || r.wpSite !== null;
    const hasFwd = r.fwdChannelId !== null || r.fwdMsgId !== null || r.fwdFromName !== null || r.fwdPostedAt !== null;
    return {
        channelId: r.channelId,
        msgId: r.msgId,
        postedAt: r.postedAt,
        editedAt: r.editedAt ?? undefined,
        text: r.text,
        entities: r.entities,
        webpage: hasWp
            ? {
                  url: r.wpUrl ?? undefined,
                  title: r.wpTitle ?? undefined,
                  description: r.wpDescription ?? undefined,
                  siteName: r.wpSite ?? undefined,
              }
            : undefined,
        fwd: hasFwd
            ? {
                  channelId: r.fwdChannelId ?? undefined,
                  msgId: r.fwdMsgId ?? undefined,
                  fromName: r.fwdFromName ?? undefined,
                  date: r.fwdPostedAt ?? undefined,
              }
            : undefined,
        replyToMsgId: r.replyToMsgId ?? undefined,
        groupedId: r.groupedId !== null ? r.groupedId.toString() : undefined,
        mediaKind: r.mediaKind as ChannelMediaKind,
        photoId: r.photoId !== null ? r.photoId.toString() : undefined,
        raw: r.raw,
    };
}
