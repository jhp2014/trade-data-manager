import { Controller, Get, Post, Delete, Inject, Query, Param, Body, BadRequestException } from "@nestjs/common";
import type { PriceLine, PriceLineRepository } from "@trade-data-manager/market";
import { PRICE_LINE_REPO } from "./tokens.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface AddPriceLineBody {
    stockCode: string;
    date: string;
    price: string; // 원(무손실 string)
    memo?: string; // 선 종류("D"=일봉 고점 / "M"=분봉)
}

// 차트 가격선 주석 CRUD — 사람이 우클릭으로 긋는 수평선. 읽기=GET, 쓰기=POST/DELETE.
@Controller("price-lines")
export class PriceLineController {
    constructor(@Inject(PRICE_LINE_REPO) private readonly repo: PriceLineRepository) {}

    @Get()
    list(@Query("code") code?: string, @Query("date") date?: string): Promise<PriceLine[]> {
        if (!code) throw new BadRequestException("code 필수");
        if (!date || !DATE_RE.test(date)) throw new BadRequestException("date 필수(YYYY-MM-DD)");
        return this.repo.listByChart(code, date);
    }

    @Post()
    async add(@Body() body: AddPriceLineBody): Promise<PriceLine> {
        if (!body?.stockCode || !body?.date || !DATE_RE.test(body.date) || body.price == null) {
            throw new BadRequestException("stockCode·date·price 필수");
        }
        const [created] = await this.repo.add([
            { stockCode: body.stockCode, date: body.date, price: String(body.price), memo: body.memo },
        ]);
        return created;
    }

    @Delete(":id")
    async remove(@Param("id") id: string): Promise<{ ok: true }> {
        await this.repo.remove(id);
        return { ok: true };
    }
}
