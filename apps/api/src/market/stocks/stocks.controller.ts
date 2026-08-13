import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import type { StockMeta } from "@trade-data-manager/wire";
import { MASTER_CACHE } from "../tokens.js";
import { assertStockCode } from "../validation.js";
import type { MasterCache } from "../board/masterCache.js";

// GET /stocks/meta?codes=005930,000660 → 종목 메타(이름·시장). 마스터 메모리 캐시(날짜무관)에서 —
// 차트·뉴스 패널이 이름 하나 얻으려 큰 보드 응답(day-summary)을 당기지 않게 한 경량 read model.

/**
 * 한 요청의 코드 수 상한 — 남용 방지. 클라는 이보다 작게 **나눠서** 보내므로(useStockNames) 정상
 * 사용에서는 닿지 않는다.
 *
 * ⚠ 넘치면 **자른 게 아니라 거절한다.** 예전엔 초과분을 조용히 버렸는데, 그러면 응답은 200이고
 * 그 종목들만 화면에서 이름 대신 코드로 떴다 — 에러도 경고도 없이. 같은 함수의 코드 검증이 이미
 * "하나라도 비표준이면 400(조용히 버리지 않음)"인데 개수만 규칙이 반대였다.
 */
const MAX_CODES = 500;

@Controller("stocks")
export class StocksController {
    constructor(@Inject(MASTER_CACHE) private readonly master: MasterCache) {}

    @Get("meta")
    async meta(@Query("codes") codes?: string): Promise<StockMeta[]> {
        const raw = (codes ?? "").split(",").map((c) => c.trim()).filter(Boolean);
        if (raw.length > MAX_CODES) {
            throw new BadRequestException(`codes 는 한 번에 ${MAX_CODES}개까지(받은 개수: ${raw.length}) — 나눠서 요청하세요`);
        }
        const list = raw.map((c) => assertStockCode(c, "codes")); // 하나라도 비표준이면 400(조용히 버리지 않음)
        if (list.length === 0) return [];
        const masters = await this.master.getByStockCodes(list);
        return masters.map((m) => ({ stockCode: m.stockCode, name: m.name, market: m.market }));
    }
}
