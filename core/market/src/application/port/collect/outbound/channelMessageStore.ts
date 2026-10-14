import type { ChannelInfo, ChannelMessage } from "#domain";

/** 한 방의 저장 범위. 행이 없으면 null. */
export interface ChannelBounds {
    minId: number;
    maxId: number;
    minPostedAt: Date;
}

/**
 * 일일 수집 커서. ⚠ 저장 행의 max(msg_id) 로 유도하지 않고 **패스를 끝까지 마쳤을 때만** 기록한다 —
 * 내림차순 순회가 중간에 끊기면 "옛 커서 ~ 이번에 받은 최저 id" 사이가 영구 구멍이 되기 때문.
 * syncedAt 은 읽기 경로의 coverage(이 날이 DB 에 통째로 있나) 근거이기도 하다.
 */
export interface ChannelCursor {
    syncedMaxId: number | null;
    syncedAt: Date | null;
}

/**
 * 뉴스 방 메시지 저장 포트(collect). 멱등 upsert — 같은 (channelId, msgId) 는 수정 시각이 바뀌었거나
 * 비어 있던 링크 미리보기가 채워진 경우에만 덮어쓴다(규칙은 어댑터가 SQL 로 강제).
 * 조회(검색·coverage)는 query 의 ChannelMessageReader 로 분리.
 */
export interface ChannelMessageStore {
    upsertChannel(info: ChannelInfo): Promise<void>;
    saveMessages(messages: ChannelMessage[]): Promise<void>;
    bounds(channelId: number): Promise<ChannelBounds | null>;
    cursor(channelId: number): Promise<ChannelCursor>;
    markSynced(channelId: number, maxId: number, at: Date): Promise<void>;
}
