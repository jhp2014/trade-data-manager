// 날짜 격자 번들 — GET /day-grids?date. 빌드·캐시는 DayGrids, 응답 압축은 main.ts 의 compression().
import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { DayGridBundle } from "@trade-data-manager/wire";
import { DAY_GRIDS } from "../tokens.js";
import { assertYmd } from "../validation.js";
import type { DayGrids } from "./dayGrids.js";

@Controller("day-grids")
export class DayGridController {
    constructor(@Inject(DAY_GRIDS) private readonly grids: DayGrids) {}

    @Get()
    bundle(@Query("date") date?: string): Promise<DayGridBundle> {
        return this.grids.bundle(assertYmd(date));
    }
}
