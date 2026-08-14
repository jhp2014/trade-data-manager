import { Controller, Get, Inject } from "@nestjs/common";
import type { StockMeta } from "@trade-data-manager/wire";
import { MASTER_CACHE } from "../tokens.js";
import type { MasterCache } from "../board/masterCache.js";

// GET /stocks/master → 종목 마스터 **전량**(코드·이름·시장). 마스터 메모리 캐시(날짜무관)에서.
//
// 클라는 이걸 부팅에 한 번 받아 들고 종목명을 그 자리에서 답한다. 옛 `?codes=…` 방식(필요한 코드를
// 모아 묻던 것)은 지웠다 — 코드 수 상한·나눠 보내기·초과분 처리라는 규칙 일습이 전부 "모아서 묻기"
// 때문에 있었는데, 그 모으는 일이 애초에 틀릴 수 있는 일이었다(자기 피드에 없는 종목을 못 모은다).
// 전량은 모을 게 없어서 그 규칙들이 통째로 사라졌다.
@Controller("stocks")
export class StocksController {
    constructor(@Inject(MASTER_CACHE) private readonly master: MasterCache) {}

    @Get("master")
    async master_(): Promise<StockMeta[]> {
        return this.master.listAllMeta();
    }
}
