import { Controller, Get, Inject, Query } from "@nestjs/common";
import { DAY_BOARDS } from "../tokens.js";
import { assertYmd } from "../validation.js";
import type { DayBoards, ReplayBoard } from "./dayBoards.js";

// GET /day-replay?date → 복기보드용 per-minute 파생 시계열 + 메타(self-contained). 조립은 DayBoards.
@Controller("day-replay")
export class DayReplayController {
    constructor(@Inject(DAY_BOARDS) private readonly boards: DayBoards) {}

    @Get()
    async dayReplay(@Query("date") date?: string): Promise<ReplayBoard> {
        return this.boards.replayBoard(assertYmd(date));
    }
}
