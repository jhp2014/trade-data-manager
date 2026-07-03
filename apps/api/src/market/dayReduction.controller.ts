import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import { DAY_REDUCTION_READER } from "./tokens.js";
import type { DayReduction } from "./dayReduction.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 당일 축약물 리더 — 파일 캐시 read-through(miss 시 raw 순회 계산). apps/api 조합(core 무변경). */
export interface DayReductionReader {
    dayReduction(date: string): Promise<DayReduction>;
}

// GET /day-reduction?date → 복기보드+이슈보드 합본 축약물. 한 번 구워 둘 다 소비(raw 재순회 0).
@Controller("day-reduction")
export class DayReductionController {
    constructor(@Inject(DAY_REDUCTION_READER) private readonly reader: DayReductionReader) {}

    @Get()
    async dayReduction(@Query("date") date?: string): Promise<DayReduction> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.reader.dayReduction(date);
    }
}
