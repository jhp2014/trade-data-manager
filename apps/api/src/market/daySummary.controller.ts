import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import { DAY_BOARDS } from "./tokens.js";
import type { DayBoards, EnrichedDaySummary } from "./dayBoards.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /day-summary?date → 테마보드용 당일 요약(스냅샷 + byTheme/byIssue 인덱스) + 이슈 축약 folding. 읽기=GET.
// 조립은 DayBoards(읽기모델)가 소유 — 리스트/필터(Scope)·순위는 클라 몫.
@Controller("day-summary")
export class DaySummaryController {
    constructor(@Inject(DAY_BOARDS) private readonly boards: DayBoards) {}

    @Get()
    summaryByDate(@Query("date") date?: string): Promise<EnrichedDaySummary> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.boards.themeBoard(date);
    }
}
