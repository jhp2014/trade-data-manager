// core/market/domain — 뉴스 방(텔레그램 채널) 메시지 아카이브 한 건(본질만).
// KIS 헤드라인(NewsHeadline — 제목 한 줄+종목 태그)과 달리 본문·서식·링크 미리보기·전달·답글·앨범·수정을 든다.
// 둘을 한 테이블로 합치지 않는 이유는 decisions.md 「텔레그램 뉴스 방 아카이브」.
// 종목 태깅은 저장하지 않는다 — 읽을 때 본문 검색(종목명 사전이 바뀌어도 재계산이 없다).
// raw 는 출처 원본의 순수 JSON(불투명) — core 는 운반만 하고 해석하지 않는다(지운 메시지는 재수집이 불가능해 박제).

export type ChannelMediaKind = "none" | "photo" | "video" | "document" | "webpage" | "other";

/** 본문 서식 엔티티. offset/length 는 UTF-16 코드유닛(JS 문자열 인덱스). TextUrl 만 url(글자 뒤 숨은 링크). */
export interface ChannelEntity {
    type: string;
    offset: number;
    length: number;
    url?: string;
}

/** 링크 미리보기 — URL-only 메시지의 "진짜 제목"이 여기 있다. */
export interface ChannelWebpage {
    url?: string;
    title?: string;
    description?: string;
    siteName?: string;
}

/** 전달 출처. 채널 전달이면 channelId+msgId(원본 기준으로 묶을 수 있다), 사람/숨김이면 fromName 만. */
export interface ChannelForward {
    channelId?: number;
    msgId?: number;
    fromName?: string;
    date?: Date;
}

export interface ChannelMessage {
    channelId: number;
    /** 방 안에서 단조 증가 — (channelId, msgId) 가 자연키이자 수집 진도의 자. */
    msgId: number;
    postedAt: Date;
    /** 마지막 수정 시각. 저장소는 이 값이 바뀐 행만 덮어쓴다. */
    editedAt?: Date;
    text: string;
    entities: ChannelEntity[];
    webpage?: ChannelWebpage;
    fwd?: ChannelForward;
    replyToMsgId?: number;
    /** 앨범 묶음 id(int64 → 10진 문자열). */
    groupedId?: string;
    mediaKind: ChannelMediaKind;
    /** 사진 id(int64 → 10진 문자열) — 이미지 단계가 이것만 보고 채운다. */
    photoId?: string;
    raw: unknown;
}

/** 방의 정체. peer 는 레지스트리 키(@username 또는 id 문자열) — 표시명과 조인하는 손잡이. */
export interface ChannelInfo {
    channelId: number;
    peer: string;
    username?: string;
    title: string;
}
