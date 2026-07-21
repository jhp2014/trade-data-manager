// infra/telegram 공개 타입 — 소비자(broker 어댑터·apps)가 의존하는 표면.
// 구현(저수준 GramJS = rawClient, 자가치유 = resilient)과 분리해 순환 import 를 피한다.

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
