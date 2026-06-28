// Inbound(driving) 포트 — 읽기 전용 후보 조회(Query, CQRS). API·저장 없이 일봉만 읽어 카운트.
// collect(쓰기)와 분리: 데이터 경로가 다르다(이건 일봉만, collect 는 분봉 fetch).
import type { DateRange, PruneOptions } from "../../../domain/index.js";

export interface DailyCandidateCount {
    date: string;
    /** 그날 스캔한 전종목(거래된 종목) 수. */
    scanned: number;
    /** 프루닝 규칙 통과 후보 수. */
    candidates: number;
}

export interface CandidateQuery {
    /** [from,to] 각 거래일의 후보 수(읽기 전용). 비거래일은 결과에서 제외. options 로 N·floor·cut 튜닝. */
    previewCandidates(range: DateRange, options?: Partial<PruneOptions>): Promise<DailyCandidateCount[]>;
}
