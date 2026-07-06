import { Controller, Get, Post, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { PriceLine, PriceLinedStock, PriceLineField, PriceLineRepository } from "@trade-data-manager/market";
import { PRICE_LINE_REPO } from "../tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;
const FIELDS = new Set<PriceLineField>(["high", "low", "open", "close"]);

interface AddPriceLineBody {
    stockCode: string;
    date: string; // 차트(종목,날짜) 로드 단위
    anchorDate: string; // 앵커 캔들 거래일 YYYY-MM-DD
    anchorTime?: string; // HH:MM:SS — 있으면 분봉 앵커, 없으면 일봉 앵커
    field?: PriceLineField; // 기본 high
    memo?: string;
}

// 차트 가격선 주석 CRUD — 사람이 우클릭으로 긋는 수평선. 가격 대신 앵커(캔들 좌표)를 저장한다.
@Controller("price-lines")
export class PriceLineController {
    constructor(@Inject(PRICE_LINE_REPO) private readonly repo: PriceLineRepository) {}

    // 작업셋 — 선이 있는 (종목,날짜) 전부(월 그룹은 클라). 정적 경로라 @Get() 인덱스와 구분됨.
    @Get("stocks")
    listStocks(): Promise<PriceLinedStock[]> {
        return this.repo.listPriceLinedStocks();
    }

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<PriceLine[]> {
        if (!code) throw new BadRequestException("code 필수");
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.repo.listByChart(code, date);
    }

    @Post()
    async add(@Body() body: AddPriceLineBody): Promise<PriceLine> {
        if (!body?.stockCode || !body?.date || !DATE_RE.test(body.date)) {
            throw new BadRequestException("stockCode·date 필수");
        }
        if (!body.anchorDate || !DATE_RE.test(body.anchorDate)) {
            throw new BadRequestException("anchorDate 필수(YYYY-MM-DD)");
        }
        if (body.anchorTime != null && !TIME_RE.test(body.anchorTime)) {
            throw new BadRequestException("anchorTime 형식(HH:MM:SS)");
        }
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
