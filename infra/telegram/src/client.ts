// infra/telegram — GramJS(MTProto) 운영 클라이언트. 포트는 모른다(broker 어댑터가 도메인 매핑).
// 세션(.env TELEGRAM_SESSION)으로 무인 접속해 "방 안 키워드 검색" 한 가지를 제공한다.
// 검색 의미(recon 실측): 토큰(단어) 단위 + 접두 매칭. 단어 중간 부분일치는 안 됨.
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ensureTelegramEnvLoaded, loadTelegramConfigFromEnv } from "./config.js";

/** 메시지에 붙은 링크 미리보기(웹페이지). URL-only 메시지의 "진짜 제목"이 여기 있다. */
export interface TelegramWebpage {
    title?: string;
    description?: string;
    url?: string;
    siteName?: string;
}

/** 검색 결과 메시지 한 건(원시 — 도메인 매핑은 broker 어댑터 몫). */
export interface TelegramMessage {
    id: number;
    /** 작성 시각(절대시간). */
    date: Date;
    /** 본문 텍스트(없을 수 있음 → 빈 문자열). URL-only 면 URL 만. */
    text: string;
    /**
     * 링크 미리보기. Telegram 서버검색은 이 제목/설명도 인덱싱하므로(recon 확인),
     * URL-only 메시지가 키워드로 잡히면 실제 매칭어는 보통 여기 있다.
     */
    webpage?: TelegramWebpage;
}

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

export interface TelegramSearchOptions {
    since?: Date;
    until?: Date;
    /** 최대 건수(기본 50). */
    limit?: number;
}

export interface Telegram {
    /**
     * 한 방(peer) 안에서 query 토큰 검색. peer 는 @username 또는 채널 id 문자열.
     * since/until 은 GramJS 가 범위질의를 직접 안 줘서 결과를 클라이언트단에서 거른다(best-effort).
     */
    searchChannel(peer: string, query: string, opts?: TelegramSearchOptions): Promise<TelegramMessage[]>;
    disconnect(): Promise<void>;
}

const DEFAULT_LIMIT = 50;

/** 세션으로 접속된 클라이언트를 만든다. 세션 없으면 막는다(먼저 recon:login). */
export async function createTelegram(): Promise<Telegram> {
    ensureTelegramEnvLoaded();
    const cfg = loadTelegramConfigFromEnv();
    if (!cfg.session) {
        throw new Error("TELEGRAM_SESSION 이 없습니다 — recon:login 으로 세션을 발급해 .env 에 채우세요.");
    }

    const client = new TelegramClient(new StringSession(cfg.session), cfg.apiId, cfg.apiHash, {
        connectionRetries: 5,
    });
    (client as unknown as { setLogLevel?: (l: string) => void }).setLogLevel?.("error");
    await client.connect();

    return {
        async searchChannel(peer, query, opts) {
            // 숫자만이면 비공개방 id → Number(access_hash 는 세션 캐시 resolve), 아니면 @username 그대로.
            const target: string | number = /^-?\d+$/.test(peer) ? Number(peer) : peer;
            const limit = opts?.limit ?? DEFAULT_LIMIT;

            const messages = await client.getMessages(target, { search: query, limit });
            let out: TelegramMessage[] = messages.map((m) => ({
                id: m.id,
                date: typeof m.date === "number" ? new Date(m.date * 1000) : new Date(0),
                text: m.message ?? "",
                webpage: extractWebpage(m.media),
            }));

            if (opts?.since) out = out.filter((m) => m.date >= opts.since!);
            if (opts?.until) out = out.filter((m) => m.date <= opts.until!);
            return out;
        },
        async disconnect() {
            await client.disconnect();
        },
    };
}
