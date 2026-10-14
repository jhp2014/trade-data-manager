import type { ArchiveCoverage, ChannelMessage } from "#domain";

/** 저장 행 + 방 레지스트리 키(telegram_channel.peer 조인) — 표시명·ref 를 만들 손잡이. */
export interface ArchivedMessage extends ChannelMessage {
    peer: string;
}

export interface ChannelMessageQuery {
    /** 이 방들만(레지스트리 peer). 목록에서 뺀 방의 잔존 행이 섞이지 않게. */
    peers: readonly string[];
    /** 전부 포함(AND) 부분일치(대소문자 무시) — 본문+미리보기 제목+설명(search_text). 빈 배열 = 피드. */
    tokens: string[];
    /** 이 시각 이후(포함). */
    since?: Date;
    /** 이 시각 이전(포함). */
    until?: Date;
    /** 전체 상한(안전용). */
    limit?: number;
}

/**
 * 뉴스 방 아카이브 조회 포트(query). 라이브 검색(NewsChannelSearch)과 달리 단어 중간 부분일치가 된다.
 * coverage 는 api 의 날짜별 DB/라이브 라우팅 근거(domain archiveCoverage.isDayCovered).
 */
export interface ChannelMessageReader {
    /** posted_at 내림차순. */
    searchMessages(q: ChannelMessageQuery): Promise<ArchivedMessage[]>;
    /**
     * peers(레지스트리) 전부가 sync 를 완주한 적이 있어야 값. 아니면 null. 목록에서 뺀 방은 안 센다 —
     * 세면 그 방의 얼어붙은 synced_at 이 to 를 붙잡아 새 날짜가 전부 조용히 라이브로 강등된다.
     */
    coverage(peers: readonly string[]): Promise<ArchiveCoverage | null>;
}
