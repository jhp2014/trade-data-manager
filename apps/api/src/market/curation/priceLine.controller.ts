import { Controller, Get, Post, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { PriceLine, PriceLinedStock, PriceLineField, PriceLineReader, PriceLineStore } from "@trade-data-manager/market";
import type { AddPriceLineInput } from "@trade-data-manager/wire";
import { PRICE_LINE_REPO, MASTER_CACHE } from "../tokens.js";
import { MasterCache } from "../board/masterCache.js";
import { assertYmd, assertHms, assertStockCode } from "../validation.js";

const FIELDS = new Set<PriceLineField>(["high", "low", "open", "close"]);

// 차트 가격선 주석 CRUD — 사람이 우클릭으로 긋는 수평선. 가격 대신 앵커(캔들 좌표)를 저장한다.
@Controller("price-lines")
export class PriceLineController {
    constructor(
        @Inject(PRICE_LINE_REPO) private readonly repo: PriceLineReader & PriceLineStore,
        @Inject(MASTER_CACHE) private readonly master: MasterCache,
    ) {}

    // 작업셋 — 선이 있는 (종목,날짜) 전부(월 그룹은 클라). 종목명 조인은 MasterCache.attachNames(앱레이어 조인).
    // 정적 경로라 @Get() 인덱스와 구분됨.
    @Get("stocks")
    async listStocks(): Promise<PriceLinedStock[]> {
        return this.master.attachNames(await this.repo.listPriceLinedStocks());
    }

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<PriceLine[]> {
        return this.repo.listByChart(assertStockCode(code), assertYmd(date));
    }

    @Post()
    async add(@Body() body: AddPriceLineInput): Promise<PriceLine> {
        const stockCode = assertStockCode(body?.stockCode, "stockCode");
        assertYmd(body.date);
        assertYmd(body.anchorDate, "anchorDate");
        if (body.anchorTime != null) assertHms(body.anchorTime, "anchorTime");
        const field = body.field ?? "high";
        if (!FIELDS.has(field)) throw new BadRequestException("field 는 high|low|open|close");
        const [created] = await this.repo.add([
            {
                stockCode,
                date: body.date,
                anchorDate: body.anchorDate,
                anchorTime: body.anchorTime,
                field,
                memo: body.memo,
            },
        ]);
        return created;
    }

    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        await this.repo.remove(id);
        return { ok: true };
    }
}
