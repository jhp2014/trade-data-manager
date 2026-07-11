import { Controller, Get, Inject, Query } from "@nestjs/common";
import { CHART_READER } from "../tokens.js";
import { assertYmd, assertStockCode } from "../validation.js";
import type { ChartBundle, ChartReadModel } from "./chartReadModel.js";

// GET /chart?code&date → 일봉 2년 + 당일 dense 분봉 raw 번들. 읽기=GET.
// 조립은 app(ChartReadModel)이 소유한다(CQRS). Symbol 토큰으로 명시 주입(인터페이스는 런타임 소멸).
@Controller("chart")
export class ChartController {
    constructor(@Inject(CHART_READER) private readonly reader: ChartReadModel) {}

    @Get()
    chartByCode(@Query("code") code?: string, @Query("date") date?: string): Promise<ChartBundle> {
        return this.reader.chartByCode(assertStockCode(code), assertYmd(date));
    }
}
