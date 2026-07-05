import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import { DAY_REPLAY_READER } from "./tokens.js";
import type { DayReplay } from "./dayReplay.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 복기 파생값 리더 — DerivedStore.replay 경유(파일 캐시 read-through, miss 시 raw 순회). apps/api 조합. */
export interface DayReplayReader {
    dayReplay(date: string): Promise<DayReplay>;
}

// GET /day-replay?date → 복기보드용 per-minute 파생 시계열.
@Controller("day-replay")
export class DayReplayController {
    constructor(@Inject(DAY_REPLAY_READER) private readonly reader: DayReplayReader) {}

    @Get()
    async dayReplay(@Query("date") date?: string): Promise<DayReplay> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.reader.dayReplay(date);
    }
}
