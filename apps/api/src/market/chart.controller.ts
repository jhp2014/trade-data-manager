import { Controller, Get, Inject, Query, BadRequestException } from "@nestjs/common";
import type { ChartBundle, ChartReader } from "@trade-data-manager/market";
import { CHART_READER } from "./tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /chart?code&date → 일봉 2년 + 당일 dense 분봉 raw 번들. 읽기=GET.
// ChartReader 는 Symbol 토큰으로 명시 주입한다(인터페이스는 런타임 소멸 → 타입기반 주입 불가).
@Controller("chart")
export class ChartController {
    constructor(@Inject(CHART_READER) private readonly reader: ChartReader) {}

    @Get()
    chartByCode(@Query("code") code?: string, @Query("date") date?: string): Promise<ChartBundle> {
        if (!code) throw new BadRequestException("code 필수");
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.reader.chartByCode(code, date);
    }
}
