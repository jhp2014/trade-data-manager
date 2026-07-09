import { Controller, Get, Post, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { PriceLine, PriceLinedStock, PriceLineField, PriceLineReader, PriceLineStore } from "@trade-data-manager/market";
import type { AddPriceLineInput } from "@trade-data-manager/wire";
import { PRICE_LINE_REPO, MASTER_CACHE } from "../tokens.js";
import { MasterCache } from "../board/masterCache.js";
import { assertYmd, assertHms } from "../validation.js";

const FIELDS = new Set<PriceLineField>(["high", "low", "open", "close"]);

// 차트 가격선 주석 CRUD — 사람이 우클릭으로 긋는 수평선. 가격 대신 앵커(캔들 좌표)를 저장한다.
@Controller("price-lines")
export class PriceLineController {
    constructor(
        @Inject(PRICE_LINE_REPO) private readonly repo: PriceLineReader & PriceLineStore,
        @Inject(MASTER_CACHE) private readonly master: MasterCache,
    ) {}

    // 작업셋 — 선이 있는 (종목,날짜) 전부(월 그룹은 클라). 선은 curation, 종목명은 market.stock_master(MasterCache)라
    // 물리 분리 시 SQL 조인 불가 → 여기(앱레이어)서 합친다. 정적 경로라 @Get() 인덱스와 구분됨.
    @Get("stocks")
    async listStocks(): Promise<PriceLinedStock[]> {
        const stocks = await this.repo.listPriceLinedStocks();
        const codes = [...new Set(stocks.map((s) => s.stockCode))];
        const masters = await this.master.getByStockCodes(codes);
        const nameByCode = new Map(masters.map((m) => [m.stockCode, m.name] as const));
        return stocks.map((s) => ({ ...s, name: nameByCode.get(s.stockCode) ?? null }));
    }

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<PriceLine[]> {
        if (!code) throw new BadRequestException("code 필수");
        return this.repo.listByChart(code, assertYmd(date));
    }

    @Post()
    async add(@Body() body: AddPriceLineInput): Promise<PriceLine> {
        if (!body?.stockCode) throw new BadRequestException("stockCode 필수");
        assertYmd(body.date);
        assertYmd(body.anchorDate, "anchorDate");
        if (body.anchorTime != null) assertHms(body.anchorTime, "anchorTime");
        const field = body.field ?? "high";
        if (!FIELDS.has(field)) throw new BadRequestException("field 는 high|low|open|close");
        const [created] = await this.repo.add([
            {
                stockCode: body.stockCode,
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
