// infra/telegram 저수준 클라이언트 — GramJS(MTProto) 한 연결. 자가치유(resilient)가 이 위에 얹힌다.
// 검색 의미(recon 실측): 토큰(단어) 단위 + 접두 매칭. 단어 중간 부분일치는 안 됨.
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { TelegramConfig } from "./config.js";
import type { TelegramMessage, TelegramWebpage } from "./types.js";
import { withTimeout, type RawTelegram, type Timeouts } from "./resilient.js";

const DEFAULT_LIMIT = 50;

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
            // 숫자만이면 비공개방 id → Number(access_hash 는 세션 캐시 resolve), 아니면 @username 그대로.
            const target: string | number = /^-?\d+$/.test(peer) ? Number(peer) : peer;
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
                });
                if (out.length >= cap) break; // 안전 상한
            }
            return out;
        },
        async sendMessage(peer, text) {
            const target: string | number = /^-?\d+$/.test(peer) ? Number(peer) : peer;
            await client.sendMessage(target, { message: text, linkPreview: false });
        },
        async destroy() {
            await client.destroy().catch(() => {});
        },
    };
}
