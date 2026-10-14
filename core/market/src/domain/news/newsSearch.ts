// core/market/domain — 소스 무관 "뉴스 검색 결과 한 건"(NewsItem).
// KIS 시황 헤드라인([[NewsHeadline]], 저장·월파티션용)과 달리, 이건 여러 출처(Telegram·향후 KIS·Naver)를
// 키워드로 검색해 합쳐 보여주기 위한 통일 출력 타입이다. 검색 "방식"(입력)은 출처마다 다르므로 포트는
// 출처별로 따로 두되, "결과"(출력)만 여기서 하나로 모은다 → 머지·정렬·표시가 출처에 독립적이 된다.
// 텔레그램은 라이브(서버 검색)와 아카이브(DB) 두 경로가 같은 NewsItem 을 내므로, "본문이냐 미리보기 제목이냐"
// 규칙(presentNewsText)도 여기 한 벌만 둔다 — 두 경로가 다른 글을 보여주면 오늘과 어제가 다르게 보인다.

/** 뉴스 출처 종류. 현재 telegram 만, kis/naver 는 합류 예정. */
export type NewsSourceKind = "telegram" | "kis" | "naver";

/** 본문 글자 뒤에 숨은 링크(TextUrl 엔티티). offset/length 는 text 의 UTF-16 인덱스. */
export interface NewsLink {
    offset: number;
    length: number;
    url: string;
}

/**
 * 검색으로 찾은 뉴스 한 건. 저장이 아니라 라이브 검색 표시용(휘발).
 * at 은 작성 시각(절대시간) — 출처 합쳐 최신순 정렬의 키.
 */
export interface NewsItem {
    source: NewsSourceKind;
    /** 출처 내 채널/방의 표시명(예: "주식 급등일보"). */
    channel: string;
    /** 작성 시각(절대시간, UTC instant). 표시계층에서 Asia/Seoul 로 포맷. */
    at: Date;
    /** 본문/헤드라인 텍스트. */
    text: string;
    /** 본문에서 추출한 대표 링크(있으면). */
    url?: string;
    /** 출처 고유 식별 — dedup·원문추적용. telegram: `${peer}#${messageId}`. */
    ref: string;
    /** 본문 안 숨은 링크(text 가 원문 본문일 때만 — 미리보기 제목으로 대체됐으면 offset 이 무의미해 비운다). */
    links?: NewsLink[];
}

/** 본문에서 첫 http(s) 링크 추출(공백 전까지). */
const URL_RE = /https?:\/\/\S+/;
/** 줄 전체가 URL 하나뿐인지(=사람이 쓴 텍스트 없음). */
const URL_ONLY_LINE = /^https?:\/\/\S+$/;

/** 사람이 쓴 본문 줄이 하나라도 있나(URL-only 줄 제외). */
export function hasBodyText(text: string): boolean {
    return text.split("\n").some((l) => {
        const t = l.trim();
        return t.length > 0 && !URL_ONLY_LINE.test(t);
    });
}

export interface NewsPreview {
    title?: string;
    description?: string;
    url?: string;
}

/**
 * 표시 규칙: 사람이 쓴 본문이 있으면 본문, URL-only 메시지면 링크 미리보기의 제목(→설명→원문).
 * 본문도 미리보기 제목도 없으면(미디어-only 등) null — 표시할 것이 없다.
 * fromBody=false 면 text 가 원문이 아니므로 호출자는 offset 기반 links 를 싣지 않는다.
 */
export function presentNewsText(
    text: string,
    webpage?: NewsPreview,
): { text: string; url?: string; fromBody: boolean } | null {
    if (text.trim().length === 0 && !webpage?.title) return null;
    const fromBody = hasBodyText(text);
    return {
        text: fromBody ? text : (webpage?.title ?? webpage?.description ?? text),
        url: webpage?.url ?? text.match(URL_RE)?.[0],
        fromBody,
    };
}

/** 엔티티 목록에서 숨은 링크만(TextUrl + url). 없으면 undefined(와이어에 빈 배열을 안 싣는다). */
export function linksFromEntities(
    entities: ReadonlyArray<{ type: string; offset: number; length: number; url?: string }> | undefined,
): NewsLink[] | undefined {
    const links = (entities ?? [])
        .filter((e): e is { type: string; offset: number; length: number; url: string } => e.type === "TextUrl" && !!e.url)
        .map((e) => ({ offset: e.offset, length: e.length, url: e.url }));
    return links.length > 0 ? links : undefined;
}
