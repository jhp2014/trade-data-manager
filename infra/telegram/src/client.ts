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
    /** 이 시각 이후(포함)까지만 거꾸로 걷는다. */
    since?: Date;
    /** 이 시각 이전(포함)부터 시작한다(offsetDate). */
    until?: Date;
    /** 안전 상한(기본 50). 시간창을 정의하는 게 아니라 폭주 방지용 — 창이 넓으면 이 수에서 끊긴다. */
    limit?: number;
}

export interface Telegram {
    /**
     * 한 방(peer) 안에서 query 토큰 검색. peer 는 @username 또는 채널 id 문자열.
     * query 가 빈 문자열이면 검색 없이 최근 메시지 피드(GetHistory) — "전체 최근" 모드.
     * until 을 offsetDate 로 줘 "그 시각 이전부터" 서버사이드로 시작하고(최신 메시지는 서버가 건너뜀),
     * 최신→과거로 페이지를 자동 순회하다 since 밑으로 내려가면 멈춘다 → 좁은 과거 창도 정확히 착지.
     * (KIS 뉴스 백필의 역방향 워크와 같은 발상.) limit 은 안전 상한.
     */
    searchChannel(peer: string, query: string, opts?: TelegramSearchOptions): Promise<TelegramMessage[]>;
    /**
     * 한 방(peer)에 텍스트 메시지 게시 — 알람 전달용(apps/live). 내 계정 발신이므로
     * 내 다른 기기엔 푸시가 안 온다(기록·타 구독자 알림용). 링크 미리보기 끔.
     */
    sendMessage(peer: string, text: string): Promise<void>;
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
        async disconnect() {
            await client.disconnect();
        },
    };
}
