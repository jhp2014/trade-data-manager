import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { StockMeta } from "@trade-data-manager/wire";
import { MASTER_CACHE } from "../tokens.js";
import { assertStockCode } from "../validation.js";
import type { MasterCache } from "../board/masterCache.js";

// GET /stocks/meta?codes=005930,000660 → 종목 메타(이름·시장). 마스터 메모리 캐시(날짜무관)에서 —
// 차트·뉴스 패널이 이름 하나 얻으려 큰 보드 응답(day-summary)을 당기지 않게 한 경량 read model.
@Controller("stocks")
export class StocksController {
    constructor(@Inject(MASTER_CACHE) private readonly master: MasterCache) {}

    @Get("meta")
    async meta(@Query("codes") codes?: string): Promise<StockMeta[]> {
        const list = (codes ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 500) // 남용 방지 상한
            .map((c) => assertStockCode(c, "codes")); // 하나라도 비표준이면 400(조용히 버리지 않음)
        if (list.length === 0) return [];
        const masters = await this.master.getByStockCodes(list);
        return masters.map((m) => ({ stockCode: m.stockCode, name: m.name, market: m.market }));
    }
}
