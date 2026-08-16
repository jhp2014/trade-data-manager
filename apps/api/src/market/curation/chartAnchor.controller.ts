import { Controller, Get, Post, Inject, Query, Body } from "@nestjs/common";
import type { AnchoredChart, ChartAnchor, ChartAnchorReader, NewChartAnchor } from "@trade-data-manager/market";
import type { AddChartAnchorInput, RemoveChartAnchorInput } from "@trade-data-manager/wire";
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
        return this.anchors.add(this.assertAnchorKey(body));
    }

    // 삭제도 추가와 **같은 좌표 튜플**(자연키)을 받는다 — id 는 계약에서 뺐다: 읽기가 로컬 미러라
    // surrogate id 가 원격과 갈릴 수 있고, 그걸 되돌려 보내면 엉뚱한 행이 지워진다.
    // 정적 경로라 @Post() 인덱스와 구분된다.
    @Post("remove")
    async remove(@Body() body: RemoveChartAnchorInput): Promise<{ ok: true }> {
        await this.anchors.remove(this.assertAnchorKey(body));
        return { ok: true };
    }

    /** HTTP 경계 검증(형식만) — 추가·삭제가 같은 자연키 튜플을 쓰므로 파싱도 한 곳이다. */
    private assertAnchorKey(body: NewChartAnchor | undefined): NewChartAnchor {
        return {
            stockCode: assertStockCode(body?.stockCode, "stockCode"),
            date: assertYmd(body?.date),
            time: body?.time != null ? assertHms(body.time) : undefined,
            param: body?.param ?? "",
            anchorDate: assertYmd(body?.anchorDate, "anchorDate"),
            anchorTime: body?.anchorTime != null ? assertHms(body.anchorTime, "anchorTime") : undefined,
            field: body?.field,
            market: body?.market,
        };
    }
}
