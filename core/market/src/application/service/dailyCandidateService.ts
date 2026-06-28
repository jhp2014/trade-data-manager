// 프루닝 유스케이스 구현 — DailyScanRepository(전종목 읽기) + 도메인 selectDailyCandidates(순수 규칙) 조합.
import { selectDailyCandidates, type PruneOptions } from "../../domain/index.js";
import type { DailyScanRepository } from "../port/outbound/index.js";
import type { DailyCandidateResult, DailyCandidateSelector } from "../port/inbound/index.js";
import { buildDailyRankInputs } from "./dailyRankInputs.js";

export interface DailyCandidateDeps {
    scanRepo: DailyScanRepository;
}

export class DailyCandidateService implements DailyCandidateSelector {
    constructor(private readonly deps: DailyCandidateDeps) {}

    async selectCandidatesForDate(
        date: string,
        options?: Partial<PruneOptions>,
    ): Promise<DailyCandidateResult> {
        const inputs = await buildDailyRankInputs(this.deps.scanRepo, date);
        if (inputs.length === 0) return { date, candidates: [], scanned: 0 };
        return { date, candidates: selectDailyCandidates(inputs, options), scanned: inputs.length };
    }
}
