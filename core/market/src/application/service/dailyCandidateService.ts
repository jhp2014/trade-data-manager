// 프루닝 유스케이스 구현 — DailyScanRepository(전종목 읽기) + 도메인 selectDailyCandidates(순수 규칙) 조합.
import { selectDailyCandidates, type PruneOptions } from "../../domain/index.js";
import type { DailyScanRepository } from "../port/outbound/index.js";
import type { DailyCandidateResult, DailyCandidateSelector } from "../port/inbound/index.js";

export interface DailyCandidateDeps {
    scanRepo: DailyScanRepository;
}

export class DailyCandidateService implements DailyCandidateSelector {
    constructor(private readonly deps: DailyCandidateDeps) {}

    async selectCandidatesForDate(
        date: string,
        options?: Partial<PruneOptions>,
    ): Promise<DailyCandidateResult> {
        const { scanRepo } = this.deps;
        const today = await scanRepo.listDailyCandlesByDate(date);
        if (today.length === 0) return { date, candidates: [], scanned: 0 };

        // 고가등락률 기준가 = 직전 거래일 UN 종가(종목별). 신규상장 등 prev 없으면 null.
        const prevDate = await scanRepo.getPreviousTradingDate(date);
        const prev = prevDate ? await scanRepo.listDailyCandlesByDate(prevDate) : [];
        const prevClose = new Map(prev.map((c) => [c.stockCode, c.un.close]));

        const inputs = today.map((c) => ({
            stockCode: c.stockCode,
            amount: c.un.amount,
            high: c.un.high,
            prevClose: prevClose.get(c.stockCode) ?? null,
        }));

        return { date, candidates: selectDailyCandidates(inputs, options), scanned: today.length };
    }
}
