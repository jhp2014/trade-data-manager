import type { ChannelInfo, ChannelMessage } from "#domain";

/**
 * 히스토리 한 페이지(출처 호출 1회, 최신→과거). messages 는 일반 메시지만.
 * pageIds 는 페이지에 실린 **모든** id(서비스·빈 메시지 포함) — 저장할 행이 0 인 페이지에서도 커서가 전진해야
 * 무한루프가 안 생긴다. pageIds 가 비면 방의 시작에 닿은 것.
 */
export interface ChannelHistoryPage {
    messages: ChannelMessage[];
    pageIds: number[];
}

export interface ChannelHistoryQuery {
    /** 이 id **미만**부터. 없으면 최신부터. */
    offsetId?: number;
}

/**
 * 뉴스 방 히스토리 소스(collect outbound) — 방 1개의 페이지 단위 순회. 어댑터(infra/broker)가 텔레그램 메시지를
 * ChannelMessage 로 매핑한다. FLOOD 대기·재접속은 소스 아래(infra/telegram)의 관심사라 여긴 모른다.
 */
export interface ChannelHistorySource {
    /** peer(레지스트리 키) → 방 정체. 수집 전 channelId 를 여기서 얻는다. */
    resolve(peer: string): Promise<ChannelInfo>;
    page(channel: ChannelInfo, query: ChannelHistoryQuery): Promise<ChannelHistoryPage>;
}
