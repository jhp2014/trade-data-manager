import { Controller, Get, Inject, Query } from "@nestjs/common";
import { DAY_BOARDS } from "../tokens.js";
import { assertYmd } from "../validation.js";
import type { DayBoards, EnrichedDaySummary } from "./dayBoards.js";

// GET /day-summary?date → 테마보드용 당일 요약(스냅샷 + byTheme 인덱스) + EOD 축약 folding. 읽기=GET.
// 조립은 DayBoards(읽기모델)가 소유 — 리스트/필터(Scope)·순위는 클라 몫.
@Controller("day-summary")
export class DaySummaryController {
    constructor(@Inject(DAY_BOARDS) private readonly boards: DayBoards) {}

    @Get()
    summaryByDate(@Query("date") date?: string): Promise<EnrichedDaySummary> {
        return this.boards.themeBoard(assertYmd(date));
    }
}
