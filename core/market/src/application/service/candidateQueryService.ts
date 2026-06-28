// CandidateQuery 구현 — 읽기 전용. 일봉만 읽어 날짜별 후보 수 계산(API·저장 없음).
import { selectDailyCandidates, type DateRange, type PruneOptions } from "../../domain/index.js";
import type { DailyScanRepository } from "../port/outbound/index.js";
import type { CandidateQuery, DailyCandidateCount } from "../port/inbound/index.js";
import { buildDailyRankInputs } from "./dailyRankInputs.js";
import { enumerateDates } from "./dates.js";

export interface CandidateQueryDeps {
    scanRepo: DailyScanRepository;
}

export class CandidateQueryService implements CandidateQuery {
    constructor(private readonly deps: CandidateQueryDeps) {}

    async previewCandidates(
        range: DateRange,
        options?: Partial<PruneOptions>,
    ): Promise<DailyCandidateCount[]> {
        const out: DailyCandidateCount[] = [];
        for (const date of enumerateDates(range.from, range.to)) {
            const inputs = await buildDailyRankInputs(this.deps.scanRepo, date);
            if (inputs.length === 0) continue; // 비거래일
            out.push({ date, scanned: inputs.length, candidates: selectDailyCandidates(inputs, options).length });
        }
        return out;
    }
}
