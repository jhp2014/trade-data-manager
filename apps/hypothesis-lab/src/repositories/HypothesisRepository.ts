import type { HypothesisSnapshot } from "@/domain/types";

/** case snapshot 입력. caseId 외 값은 Sheet 컬럼/파싱으로 채운다. */
export type CaseInput = {
    caseId: string;
    stockCode: string;
    stockName?: string | null;
    tradeDate: string; // YYYY-MM-DD
    tradeTime?: string | null; // HH:MM[:SS]
    extra?: Record<string, string>;
};

/**
 * 가설 데이터 접근의 단일 seam(repository). UI 와 무관하며,
 * 구현체(DbHypothesisRepository)는 'hypothesis' Postgres schema 만 다룬다.
 *
 * 설계 원칙:
 * - case snapshot 은 insert-if-absent(ensureCase) — 워킹셋을 여러 번 읽어도
 *   기존 값을 덮지 않는다. 갱신은 명시적 refreshCaseStockName 으로만.
 * - relation 순환/자기참조 등은 저장을 막지 않는다(경고는 loadSnapshot.warnings).
 */
export interface HypothesisRepository {
    /** 6테이블 + 경고를 한 번에 로드. */
    loadSnapshot(): Promise<HypothesisSnapshot>;

    /** 스냅샷에 들어온 case 들의 caseId (워킹셋 snapshot 모드용, 경량 조회). */
    listSnapshotCaseIds(): Promise<string[]>;

    // --- hypotheses ---
    createHypothesis(input: {
        text: string;
        status?: string;
        extra?: Record<string, string>;
    }): Promise<{ id: string; code: string }>;
    updateHypothesis(input: {
        id: string;
        text?: string;
        status?: string;
    }): Promise<void>;
    deleteHypothesis(id: string): Promise<void>;

    // --- cases (snapshot) ---
    /** insert-if-absent. 이미 있으면 아무것도 덮지 않는다. */
    ensureCase(input: CaseInput): Promise<void>;
    /** stockName 명시적 갱신. */
    refreshCaseStockName(input: { caseId: string; stockName: string | null }): Promise<void>;
    /** 케이스 레벨 outcome(트레이드 결과) 설정. null=해제. */
    setCaseOutcome(input: { caseId: string; outcome: string | null }): Promise<void>;
    /** 케이스 자유 메모 설정. null=제거. */
    setCaseNote(input: { caseId: string; note: string | null }): Promise<void>;
    /** case 제거(연결도 cascade). */
    removeCase(caseId: string): Promise<void>;

    // --- hypothesis <-> case ---
    upsertCaseLink(input: {
        hypothesisId: string;
        caseId: string;
        note?: string | null;
    }): Promise<void>;
    removeCaseLink(input: { hypothesisId: string; caseId: string }): Promise<void>;

    // --- tags ---
    /** 태그를 이름으로 보장(insert-if-absent)하고 가설에 연결. */
    addTag(input: { hypothesisId: string; tagName: string }): Promise<void>;
    removeTag(input: { hypothesisId: string; tagId: string }): Promise<void>;

    // --- relations ---
    upsertRelation(input: {
        fromHypothesisId: string;
        toHypothesisId: string;
        relationType: string;
        note?: string | null;
    }): Promise<void>;
    removeRelation(input: {
        fromHypothesisId: string;
        toHypothesisId: string;
        relationType: string;
    }): Promise<void>;
    /** 특정 종류의 관계 전부 삭제(설정에서 종류 삭제 시 cascade). */
    deleteRelationsByType(relationType: string): Promise<void>;
}
