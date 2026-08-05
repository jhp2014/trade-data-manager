import { Controller, Get, Post, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { AnchoredChart, ChartAnchor, ChartAnchorReader } from "@trade-data-manager/market";
import type { AddChartAnchorInput } from "@trade-data-manager/wire";
import { CHART_ANCHOR_REPO, CHART_ANCHORS, MASTER_CACHE } from "../tokens.js";
import { ChartAnchors } from "./chartAnchors.js";
import { MasterCache } from "../board/masterCache.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

// 차트 앵커 HTTP 어댑터 — 읽기는 repo 그대로, **쓰기는 유스케이스(ChartAnchors)** 를 거친다.
// 쓰기 불변식(레지스트리·owner grain·골격 집합 규칙·multiple 교체·타점 cascade)은 전부 유스케이스 소유 —
// 여기는 HTTP 경계 검증(형식)만 한다. 규칙이 컨트롤러에 살면 repo 를 직접 부르는 다른 경로가 전부 우회한다.
@Controller("chart-anchors")
export class ChartAnchorController {
    constructor(
        @Inject(CHART_ANCHOR_REPO) private readonly repo: ChartAnchorReader,
        @Inject(CHART_ANCHORS) private readonly anchors: ChartAnchors,
        @Inject(MASTER_CACHE) private readonly master: MasterCache,
    ) {}

    // 작업셋 — 기준선(=선)이 있는 (종목,날짜) 전부(월 그룹은 클라). 종목명 조인은 MasterCache.attachNames.
    // 정적 경로라 @Get() 인덱스와 구분됨.
    @Get("stocks")
    async listStocks(): Promise<AnchoredChart[]> {
        return this.master.attachNames(await this.repo.listAnchoredCharts());
    }

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<ChartAnchor[]> {
        return this.repo.listByChart(assertStockCode(code), assertYmd(date));
    }

    @Post()
    add(@Body() body: AddChartAnchorInput): Promise<ChartAnchor> {
        return this.anchors.add({
            stockCode: assertStockCode(body?.stockCode, "stockCode"),
            date: assertYmd(body?.date),
            time: body?.time != null ? assertHms(body.time) : undefined,
            param: body?.param ?? "",
            anchorDate: assertYmd(body?.anchorDate, "anchorDate"),
            anchorTime: body?.anchorTime != null ? assertHms(body.anchorTime, "anchorTime") : undefined,
            field: body?.field,
            market: body?.market,
        });
    }

    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        if (!/^\d+$/.test(id)) throw new BadRequestException("id 는 숫자");
        await this.anchors.removeById(id);
        return { ok: true };
    }
}
