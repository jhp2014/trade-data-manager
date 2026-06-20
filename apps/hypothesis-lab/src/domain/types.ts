/**
 * 도메인 타입. DB row(bigint id 등)와 UI 사이의 표현.
 * id 는 직렬화 안전을 위해 string 으로 노출한다(bigint 회피).
 * 모든 엔티티의 extra 는 App 이 의미를 모르지만 화면에 보여줄 동적 컬럼.
 */

/** 가설에 1개 이상 연결된 case 의 snapshot. */
export type Case = {
    caseId: string;
    stockCode: string;
    stockName: string | null;
    tradeDate: string; // YYYY-MM-DD
    tradeTime: string | null; // HH:MM
    /** 이 트레이드의 실제 결과(가설 무관). 허용값은 domain/outcome 가 고정. null=미설정. */
    outcome: string | null;
    extra: Record<string, string>;
};

/** 가설 원본. code 는 id 에서 파생(H0001). status 는 느슨한 문자열. */
export type Hypothesis = {
    id: string;
    code: string;
    text: string;
    status: string;
    extra: Record<string, string>;
};

export type Tag = {
    id: string;
    name: string;
};

export type HypothesisTag = {
    hypothesisId: string;
    tagId: string;
};

/** 가설 ↔ case 연결 + note. (트레이드 결과 outcome 은 Case.outcome 으로 이동.) */
export type HypothesisCase = {
    id: string;
    hypothesisId: string;
    caseId: string;
    note: string | null;
    extra: Record<string, string>;
};

/** 가설 그래프 간선. relationType 은 느슨한 문자열. */
export type HypothesisRelation = {
    id: string;
    fromHypothesisId: string;
    toHypothesisId: string;
    relationType: string;
    note: string | null;
};

/**
 * 저장은 차단하지 않고 경고로만 표면화하는 검증 결과.
 * FK 가 참조 무결성을 강제하므로 "존재하지 않는 ID 참조"류는 DB 에서 불가능 →
 * relation 그래프의 의미적 문제만 검사한다.
 */
export type ValidationWarningCode =
    | "self_relation"
    | "unknown_relation_type"
    | "cycle_better_than"
    | "cycle_parent_of";

export type ValidationWarning = {
    code: ValidationWarningCode;
    message: string;
    /** 관련 엔티티 id 들(가설 id, 관계 id, caseId 등) — UI 하이라이트용. */
    refs: string[];
};

/** Repository 가 한 번에 로드하는 전체 스냅샷. */
export type HypothesisSnapshot = {
    cases: Case[];
    hypotheses: Hypothesis[];
    tags: Tag[];
    hypothesisTags: HypothesisTag[];
    hypothesisCases: HypothesisCase[];
    hypothesisRelations: HypothesisRelation[];
    warnings: ValidationWarning[];
};
