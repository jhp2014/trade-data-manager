import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import type { DaySummary, DaySummaryReader } from "@trade-data-manager/market";
import { DAY_SUMMARY_READER } from "./tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /day-summary?date → 그날 universe 전체의 당일 요약(스냅샷 + byTheme/byIssue 인덱스). 읽기=GET.
// 리스트/필터(Scope)·순위는 클라 몫 — 여긴 read model 한 덩어리만 내려준다.
@Controller("day-summary")
export class DaySummaryController {
    constructor(@Inject(DAY_SUMMARY_READER) private readonly reader: DaySummaryReader) {}

    @Get()
    summaryByDate(@Query("date") date?: string): Promise<DaySummary> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.reader.summaryByDate(date);
    }
}
