import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import { DAY_BOARDS } from "./tokens.js";
import type { DayBoards, ReplayBoard } from "./dayBoards.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /day-replay?date → 복기보드용 per-minute 파생 시계열 + 메타(self-contained). 조립은 DayBoards.
@Controller("day-replay")
export class DayReplayController {
    constructor(@Inject(DAY_BOARDS) private readonly boards: DayBoards) {}

    @Get()
    async dayReplay(@Query("date") date?: string): Promise<ReplayBoard> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.boards.replayBoard(date);
    }
}
