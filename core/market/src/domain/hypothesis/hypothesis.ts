// core/market/domain/hypothesis — 매매 가설(사람 편집). 복기 타점(review point)을 자연키로 참조하는 하류.
// 가설 원본 + 타점 연결(정션) + 가설 사이 그래프. 표시코드 H1 은 id 에서 파생(저장 X).
// tags/status/extra 없음(필요시 나중). node/type 일반화는 2번째 노드타입 도래 시(defer).

/** 매매 가설 1건. */
export interface Hypothesis {
    id?: string; // surrogate(bigint). 신규(미저장)면 undefined, 조회/저장 후면 존재.
    text: string;
}

/** 가설 ↔ 복기 타점 연결(자연키 = stockCode,date,time). 순수 정션(surrogate 없음). */
export interface HypothesisLink {
    hypothesisId: string;
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
}

/** 가설 그래프 엣지(트리 아님). relationType 느슨 — 막지 말고 App 경고. */
export interface HypothesisRelation {
    id?: string; // surrogate(bigint).
    fromId: string;
    toId: string;
    relationType: string; // better_than | parent_of | similar_to | conflicts_with | ...
    note?: string;
}
