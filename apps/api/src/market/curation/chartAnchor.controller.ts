import { Controller, Get, Post, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import {
    anchorInputError,
    anchorParamByKey,
    type AnchoredChart,
    type AnchorField,
    type AnchorMarket,
    type ChartAnchor,
    type ChartAnchorReader,
    type ChartAnchorStore,
} from "@trade-data-manager/market";
import type { AddChartAnchorInput } from "@trade-data-manager/wire";
import { CHART_ANCHOR_REPO, MASTER_CACHE } from "../tokens.js";
import { MasterCache } from "../board/masterCache.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

const FIELDS = new Set<AnchorField>(["high", "low", "open", "close"]);
const MARKETS = new Set<AnchorMarket>(["krx", "un"]);

// 차트 앵커 CRUD — 선(param 'baseline')과 파라미터 앵커(무시 캔들 등)가 한 자원. 소유는 차트(종목,날짜).
// param 은 코드 레지스트리 키만 허용(오타 = 조용한 결손 방지). 저장 규칙 종합은 도메인(anchorInputError) —
// owner grain·field·market 쌍·캔들 종류·분봉 market='un' 을 한 곳에서 검증한다.
@Controller("chart-anchors")
export class ChartAnchorController {
    constructor(
        @Inject(CHART_ANCHOR_REPO) private readonly repo: ChartAnchorReader & ChartAnchorStore,
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
    async add(@Body() body: AddChartAnchorInput): Promise<ChartAnchor> {
        const def = anchorParamByKey.get(body?.param ?? "");
        if (!def) throw new BadRequestException(`param 은 레지스트리 키만: ${[...anchorParamByKey.keys()].join("|")}`);
        const anchor = {
            stockCode: assertStockCode(body.stockCode, "stockCode"),
            date: assertYmd(body.date),
            time: body.time != null ? assertHms(body.time) : undefined,
            param: def.key,
            anchorDate: assertYmd(body.anchorDate, "anchorDate"),
            anchorTime: body.anchorTime != null ? assertHms(body.anchorTime, "anchorTime") : undefined,
            field: body.field,
            market: body.market,
        };
        if (anchor.field != null && !FIELDS.has(anchor.field)) throw new BadRequestException("field 는 high|low|open|close");
        if (anchor.market != null && !MARKETS.has(anchor.market)) throw new BadRequestException("market 은 krx|un");
        const ruleError = anchorInputError(def, anchor);
        if (ruleError) throw new BadRequestException(ruleError);
        // 단일 param(multiple:false)은 교체 — 지금 레지스트리엔 없지만, 생기면 저장이 조용히 둘을 만들지 않게 여기서 지운다.
        if (!def.multiple) await this.repo.removeByParam(anchor.stockCode, anchor.date, def.key);
        const [created] = await this.repo.add([anchor]);
        return created;
    }

    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        if (!/^\d+$/.test(id)) throw new BadRequestException("id 는 숫자");
        await this.repo.removeById(id);
        return { ok: true };
    }
}
