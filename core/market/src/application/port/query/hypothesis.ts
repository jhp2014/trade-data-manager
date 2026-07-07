import type { Hypothesis, HypothesisLink, HypothesisRelation } from "#domain";

// 가설 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 조립·필터는 core 서비스가 아니라 클라가 인메모리로 한다(옵션 A) → 여기선 flat 목록/편집만 노출.
// 가설↔타점 연결은 자연키(stockCode,date,time) = review point 삼중키. 자세한 설계는 domain/hypothesis.

/** 가설 조회(읽기). 클라가 세 목록을 받아 스냅샷으로 조립·필터한다. */
export interface HypothesisReader {
    /** 전체 가설(id 오름차순). */
    listHypotheses(): Promise<Hypothesis[]>;
    /** 전체 가설↔타점 링크. 클라가 타점별/가설별로 인덱싱. */
    listLinks(): Promise<HypothesisLink[]>;
    /** 전체 가설 관계(그래프 엣지). */
    listRelations(): Promise<HypothesisRelation[]>;
}

/** 가설 편집(쓰기). 생성 + 타점 연결/해제(관계 편집은 후속). */
export interface HypothesisStore {
    /** 새 가설 생성 → DB 가 부여한 id 를 채워 반환. */
    create(text: string): Promise<Hypothesis>;
    /** 가설 ↔ 타점 연결(멱등 — 이미 있으면 무시). */
    link(link: HypothesisLink): Promise<void>;
    /** 가설 ↔ 타점 연결 해제. */
    unlink(link: HypothesisLink): Promise<void>;
    /** 가설 삭제 — 연결·관계도 FK cascade 로 함께 제거. */
    remove(id: string): Promise<void>;
    /** 가설 관계 추가(멱등 — 같은 from·type·to 있으면 기존 반환). */
    addRelation(relation: { fromId: string; toId: string; relationType: string; note?: string }): Promise<HypothesisRelation>;
    /** 가설 관계 삭제(id). */
    removeRelation(id: string): Promise<void>;
}
