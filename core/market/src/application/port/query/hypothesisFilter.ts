import type { HypothesisFilter, HypothesisFilterExpr } from "#domain";

// 저장된 가설 필터 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 앱 대면(query).
// 필터식(DNF)만 저장하고 outcome/type 패싯은 임시 드릴다운(저장 X). 삭제된 가설 참조는 클라가 degrade.

/** 저장 필터 조회. */
export interface HypothesisFilterReader {
    /** 전체 저장 필터(이름순). */
    listFilters(): Promise<HypothesisFilter[]>;
}

/** 저장 필터 편집. save 는 같은 이름이면 덮어쓰기(upsert). */
export interface HypothesisFilterStore {
    /** 이름+식 저장 → DB id 채워 반환. 같은 이름 있으면 식 갱신(파일 저장 관례). */
    save(name: string, expr: HypothesisFilterExpr): Promise<HypothesisFilter>;
    /** 저장 필터 삭제(id). */
    remove(id: string): Promise<void>;
}
