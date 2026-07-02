import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import type { ChartBundle } from "@trade-data-manager/market";
import { DAY_CHARTS_READER } from "./tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 당일 전체 차트 리더 — apps/api 조합(core 무변경). universe 코드 → chartsByCodes 벌크.
 * ChartReader.chartsByCodes 는 이미 core 에 있고, 여기선 universe 코드만 붙여 노출한다.
 */
export interface DayChartsReader {
    dayCharts(date: string): Promise<ChartBundle[]>;
}

// GET /day-charts?date → 그날 universe 전 종목의 ChartBundle[](raw). 클라가 통째로 들고 시점별 파생.
@Controller("day-charts")
export class DayChartsController {
    constructor(@Inject(DAY_CHARTS_READER) private readonly reader: DayChartsReader) {}

    @Get()
    dayCharts(@Query("date") date?: string): Promise<ChartBundle[]> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.reader.dayCharts(date);
    }
}
