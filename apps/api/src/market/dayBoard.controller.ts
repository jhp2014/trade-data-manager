import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import { DAY_CHARTS_READER } from "./tokens.js";
import type { DayChartsReader } from "./dayCharts.controller.js";
import { reduceToLeanBoard, type LeanBoard } from "./dayBoard.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /day-board?date → 실시간 복기 보드용 lean 지표(종목별 분당 running). 서버 무상태 온더플라이.
// DAY_CHARTS_READER(ChartBundle[] 벌크)를 재사용해 apps/api 에서 lean 으로 감축(core 무변경).
@Controller("day-board")
export class DayBoardController {
    constructor(@Inject(DAY_CHARTS_READER) private readonly charts: DayChartsReader) {}

    @Get()
    async dayBoard(@Query("date") date?: string): Promise<LeanBoard> {
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        const bundles = await this.charts.dayCharts(date);
        return reduceToLeanBoard(bundles, date);
    }
}
