// infra/telegram 공개 타입 — 소비자(broker 어댑터·apps)가 의존하는 표면.
// 구현(저수준 GramJS = rawClient, 자가치유 = resilient)과 분리해 순환 import 를 피한다.

/** 메시지에 붙은 링크 미리보기(웹페이지). URL-only 메시지의 "진짜 제목"이 여기 있다. */
export interface TelegramWebpage {
    title?: string;
    description?: string;
    url?: string;
    siteName?: string;
}

/**
 * 본문 서식 엔티티(TL MessageEntity* 평탄화). offset/length 는 Telegram 규약대로 UTF-16 코드유닛 단위
 * (JS 문자열 인덱스와 같다). `TextUrl` 만 url 을 든다 — 글자 뒤에 숨은 기사 원문 링크가 여기 있다.
 */
export interface TelegramEntity {
    /** TL 클래스명에서 "MessageEntity" 를 뗀 것: Url · TextUrl · Bold · Hashtag · Blockquote … */
    type: string;
    offset: number;
    length: number;
    url?: string;
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
    /** 본문 서식(숨은 링크 포함). 아카이브와 같은 모양으로 — 오늘(라이브)과 과거(DB)가 같은 것을 돌려주게. */
    entities?: TelegramEntity[];
}

export interface TelegramSearchOptions {
    /** 이 시각 이후(포함)까지만 거꾸로 걷는다. */
    since?: Date;
    /** 이 시각 이전(포함)부터 시작한다(offsetDate). */
    until?: Date;
    /** 안전 상한(기본 50). 시간창을 정의하는 게 아니라 폭주 방지용 — 창이 넓으면 이 수에서 끊긴다. */
    limit?: number;
}

export type TelegramMediaKind = "none" | "photo" | "video" | "document" | "webpage" | "other";

/** 전달(forward) 출처. 채널에서 전달됐으면 channelId+msgId, 사람/숨김이면 fromName 만. */
export interface TelegramForward {
    channelId?: number;
    msgId?: number;
    fromName?: string;
    date?: Date;
}

/** 히스토리 순회로 받은 메시지 한 건 — 아카이브 적재용 리치 모양(검색용 TelegramMessage 의 상위집합). */
export interface TelegramHistoryMessage {
    id: number;
    date: Date;
    /** 마지막 수정 시각(없으면 미수정). 아카이브는 이 값이 바뀐 행만 덮어쓴다. */
    editDate?: Date;
    text: string;
    entities: TelegramEntity[];
    webpage?: TelegramWebpage;
    fwd?: TelegramForward;
    replyToMsgId?: number;
    /** 앨범 묶음 id(int64 → 10진 문자열). */
    groupedId?: string;
    mediaKind: TelegramMediaKind;
    /** 사진 id(int64 → 10진 문자열). 나중 이미지 단계가 이것만 보고 채운다. */
    photoId?: string;
    /** GramJS 원본의 순수 JSON(serialize.toPlain). 해석하지 않고 박제한다. */
    raw: unknown;
}

/**
 * 히스토리 한 페이지(GetHistory 1회). messages 는 일반 메시지만(서비스·빈 메시지 제외).
 * pageIds 는 페이지에 실린 **모든** id — 서비스 메시지만 있는 페이지에서도 커서가 전진할 수 있게.
 * pageIds 가 비면 끝(더 과거 없음).
 */
export interface TelegramHistoryPage {
    messages: TelegramHistoryMessage[];
    pageIds: number[];
}

export interface TelegramHistoryOptions {
    /** 이 id **미만**부터(내림차순). 없으면 최신부터. */
    offsetId?: number;
    /** 페이지 크기(기본·최대 100 — Telegram 상한). */
    limit?: number;
}

/** 방의 정체(getEntity). channelId 는 -100 접두 없는 양수. */
export interface TelegramChannelInfo {
    channelId: number;
    username?: string;
    title: string;
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
     * 한 방의 히스토리 한 페이지(RPC 1회, 최신→과거). 아카이브 수집 전용 — FLOOD_WAIT 를 만나면
     * 그만큼 쉬었다가 같은 페이지를 다시 청한다(상한 안에서). 페이지 단위라 긴 순회도 요청 타임아웃에 안 걸린다.
     */
    historyPage(peer: string, opts?: TelegramHistoryOptions): Promise<TelegramHistoryPage>;
    /** peer → 방 정체(id·username·title). 아카이브의 channel_id 를 여기서 얻는다. */
    resolveChannel(peer: string): Promise<TelegramChannelInfo>;
    /**
     * 한 방(peer) 안에 텍스트 메시지 게시 — 알람 전달용(apps/live). 내 계정 발신이므로
     * 내 다른 기기엔 푸시가 안 온다(기록·타 구독자 알림용). 링크 미리보기 끔.
     */
    sendMessage(peer: string, text: string): Promise<void>;
    disconnect(): Promise<void>;
}
