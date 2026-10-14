// infra/telegram 저수준 클라이언트 — GramJS(MTProto) 한 연결. 자가치유(resilient)가 이 위에 얹힌다.
// 검색 의미(recon 실측): 토큰(단어) 단위 + 접두 매칭. 단어 중간 부분일치는 안 됨.
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { TelegramConfig } from "./config.js";
import type {
    TelegramChannelInfo,
    TelegramEntity,
    TelegramForward,
    TelegramHistoryMessage,
    TelegramHistoryPage,
    TelegramMediaKind,
    TelegramMessage,
    TelegramWebpage,
} from "./types.js";
import { withTimeout, type RawTelegram, type Timeouts } from "./resilient.js";
import { toPlain } from "./serialize.js";

const DEFAULT_LIMIT = 50;
/** Telegram GetHistory 페이지 상한. */
const HISTORY_PAGE_MAX = 100;

/** 메시지 media 에서 웹페이지 미리보기를 뽑는다(없으면 undefined). */
function extractWebpage(media: Api.Message["media"]): TelegramWebpage | undefined {
    if (media instanceof Api.MessageMediaWebPage && media.webpage instanceof Api.WebPage) {
        const wp = media.webpage;
        return {
            title: wp.title ?? undefined,
            description: wp.description ?? undefined,
            url: wp.url ?? undefined,
            siteName: wp.siteName ?? undefined,
        };
    }
    return undefined;
}

function extractEntities(entities: Api.Message["entities"]): TelegramEntity[] {
    return (entities ?? []).map((e) => ({
        type: e.className.replace(/^MessageEntity/, ""),
        offset: e.offset,
        length: e.length,
        url: e instanceof Api.MessageEntityTextUrl ? e.url : undefined,
    }));
}

function extractForward(fwd: Api.Message["fwdFrom"]): TelegramForward | undefined {
    if (!fwd) return undefined;
    return {
        channelId: fwd.fromId instanceof Api.PeerChannel ? Number(fwd.fromId.channelId.toString()) : undefined,
        msgId: fwd.channelPost ?? undefined,
        fromName: fwd.fromName ?? undefined,
        date: typeof fwd.date === "number" ? new Date(fwd.date * 1000) : undefined,
    };
}

function mediaOf(media: Api.Message["media"]): { kind: TelegramMediaKind; photoId?: string } {
    if (!media) return { kind: "none" };
    if (media instanceof Api.MessageMediaWebPage) return { kind: "webpage" };
    if (media instanceof Api.MessageMediaPhoto) {
        return { kind: "photo", photoId: media.photo instanceof Api.Photo ? media.photo.id.toString() : undefined };
    }
    if (media instanceof Api.MessageMediaDocument) {
        const doc = media.document;
        const isVideo = doc instanceof Api.Document && doc.attributes.some((a) => a instanceof Api.DocumentAttributeVideo);
        return { kind: isVideo ? "video" : "document" };
    }
    return { kind: "other" };
}

function toHistoryMessage(m: Api.Message): TelegramHistoryMessage {
    const media = mediaOf(m.media);
    return {
        id: m.id,
        date: new Date(m.date * 1000),
        editDate: typeof m.editDate === "number" ? new Date(m.editDate * 1000) : undefined,
        text: m.message ?? "",
        entities: extractEntities(m.entities),
        webpage: extractWebpage(m.media),
        fwd: extractForward(m.fwdFrom),
        replyToMsgId: m.replyTo instanceof Api.MessageReplyHeader ? (m.replyTo.replyToMsgId ?? undefined) : undefined,
        groupedId: m.groupedId ? m.groupedId.toString() : undefined,
        mediaKind: media.kind,
        photoId: media.photoId,
        raw: toPlain(m),
    };
}

/** 숫자만이면 비공개방 id → Number(access_hash 는 세션 캐시 resolve), 아니면 @username 그대로. */
function toTarget(peer: string): string | number {
    return /^-?\d+$/.test(peer) ? Number(peer) : peer;
}

/**
 * 세션으로 접속·검증까지 끝낸 살아있는 RawTelegram 을 새로 세운다(재빌드마다 new client = 깨끗한 상태).
 * 세션 없으면 막는다(먼저 recon:login). connect/getMe 는 wedge 방지로 타임아웃을 씌운다.
 */
export async function openRawTelegram(cfg: TelegramConfig, t: Timeouts): Promise<RawTelegram> {
    if (!cfg.session) {
        throw new Error("TELEGRAM_SESSION 이 없습니다 — recon:login 으로 세션을 발급해 .env 에 채우세요.");
    }

    const client = new TelegramClient(new StringSession(cfg.session), cfg.apiId, cfg.apiHash, {
        connectionRetries: 5,
        // GramJS 는 이 초 이하의 FLOOD_WAIT 를 invoke 안에서 스스로 잔다(기본 60s). 그게 opTimeoutMs(30s)보다
        // 길면 flood 가 TIMEOUT 으로 둔갑해 연결 오류로 오분류된다 → 임계를 op 타임아웃보다 확실히 짧게.
        // 그보다 긴 flood 는 FloodWaitError 로 표면화되고 resilient 가 (히스토리 경로만) 바깥에서 쉰다.
        floodSleepThreshold: 10,
    });
    (client as unknown as { setLogLevel?: (l: string) => void }).setLogLevel?.("error");
    await withTimeout(client.connect(), t.connectTimeoutMs, "connect");
    // 접속(transport)만으론 세션 유효성을 모른다 — 폐기(SESSION_REVOKED)는 첫 RPC 에서야 드러나므로
    // 여기서 가벼운 getMe 로 검증해 소비자(검색·알람)가 명확한 지점에서 실패하게 한다.
    try {
        await withTimeout(client.getMe(), t.connectTimeoutMs, "getMe");
    } catch (e) {
        await client.destroy().catch(() => {});
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`텔레그램 세션 무효(${msg}) — recon:login 으로 재발급해 .env 의 TELEGRAM_SESSION 을 갱신하세요.`);
    }

    return {
        isConnected: () => client.connected ?? false,
        async searchChannel(peer, query, opts) {
            const target = toTarget(peer);
            const cap = opts?.limit ?? DEFAULT_LIMIT;
            // offsetDate 는 unix 초. until 포함을 위해 +1초("그 시각 이전"부터). 없으면 최신부터.
            const offsetDate = opts?.until ? Math.floor(opts.until.getTime() / 1000) + 1 : undefined;
            const sinceMs = opts?.since?.getTime();

            // iterMessages 는 offsetDate 부터 최신→과거로 자동 페이지네이션한다.
            // 빈 query 는 search 키 자체를 생략 — messages.Search(q="") 의 미정의 동작 대신 GetHistory(전체 피드)를 탄다.
            const out: TelegramMessage[] = [];
            for await (const m of client.iterMessages(target, query ? { search: query, offsetDate } : { offsetDate })) {
                const ms = typeof m.date === "number" ? m.date * 1000 : 0;
                if (sinceMs !== undefined && ms < sinceMs) break; // since 밑 → 이후는 더 과거라 종료
                out.push({
                    id: m.id,
                    date: new Date(ms),
                    text: m.message ?? "",
                    webpage: extractWebpage(m.media),
                    entities: extractEntities(m.entities),
                });
                if (out.length >= cap) break; // 안전 상한
            }
            return out;
        },
        async historyPage(peer, opts) {
            const limit = Math.min(opts?.limit ?? HISTORY_PAGE_MAX, HISTORY_PAGE_MAX);
            // getMessages(limit ≤ 100) = GetHistory 딱 1회. offsetId 는 배타(그 id 미만부터), 내림차순.
            const page = await client.getMessages(toTarget(peer), { limit, offsetId: opts?.offsetId ?? 0 });
            const pageIds: number[] = [];
            const messages: TelegramHistoryMessage[] = [];
            for (const m of page) {
                pageIds.push(m.id);
                if (m instanceof Api.Message) messages.push(toHistoryMessage(m));
            }
            return { messages, pageIds } satisfies TelegramHistoryPage;
        },
        async resolveChannel(peer) {
            const entity = await client.getEntity(toTarget(peer));
            if (!(entity instanceof Api.Channel)) {
                throw new Error(`${peer} 는 채널이 아닙니다(${entity.className})`);
            }
            return {
                channelId: Number(entity.id.toString()),
                username: entity.username ?? undefined,
                title: entity.title,
            } satisfies TelegramChannelInfo;
        },
        async sendMessage(peer, text) {
            await client.sendMessage(toTarget(peer), { message: text, linkPreview: false });
        },
        async destroy() {
            await client.destroy().catch(() => {});
        },
    };
}
