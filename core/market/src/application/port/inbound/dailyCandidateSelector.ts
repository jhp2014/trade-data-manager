// Inbound(driving) 포트 — 한 거래일의 분봉 수집 후보 선정(프루닝). 3단계 분봉 스윕의 입력.
import type { PruneOptions } from "../../../domain/index.js";

export interface DailyCandidateResult {
    date: string;
    /** 분봉 수집 후보 stockCode 들(랭킹·후보는 저장 안 함 — 읽을 때 재계산). */
    candidates: string[];
    /** 그날 스캔한 전종목 수(거래된 종목). */
    scanned: number;
}

export interface DailyCandidateSelector {
    /** date 의 전종목 일봉을 읽어 프루닝 규칙으로 후보를 추린다. options 로 N·floor·cut 조정 가능. */
    selectCandidatesForDate(
        date: string,
        options?: Partial<PruneOptions>,
    ): Promise<DailyCandidateResult>;
}
