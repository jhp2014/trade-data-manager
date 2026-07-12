// 실시간 차트 엔드포인트 — GET /chart?code= (워크벤치는 /live 프록시 경유 → /live/chart).
// apps/api 의 /chart(EOD, DB)와 같은 ChartBundle 계약이지만 소스가 kiwoom 라이브라 date 인자 없음(항상 오늘/마지막 세션).
import { Controller, Get, Query, Inject, BadRequestException } from "@nestjs/common";
import type { ChartBundle } from "@trade-data-manager/wire";
import { LIVE_CHART } from "../tokens.js";
import type { LiveChartService } from "./liveChart.js";

@Controller("chart")
export class ChartController {
    constructor(@Inject(LIVE_CHART) private readonly chart: LiveChartService) {}

    @Get()
    async byCode(@Query("code") code?: string, @Query("date") date?: string): Promise<ChartBundle> {
        if (!code) throw new BadRequestException("code 파라미터 필요");
        return this.chart.chartByCode(code, date || undefined); // date 미지정=오늘, 지정=과거 탐색
    }
}
