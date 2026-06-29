// IpoPriceBackfillService — 공모가 백필(일회성 enrichment) 구현.
// 협력: ListInfoProvider(예탁원 상장정보일정) · StockMasterRepository(공모가 갱신).
// 흐름: ① [상장일, 오늘] list-info 조회  ② extractIpoPrice(상장일 유상증자 행)  ③ 있으면 stock_master 갱신.
// 시총 백필과 소스(getListInfo)는 같지만, 일회성이라 fetch 를 공유하지 않고 각자 호출해 로직을 단순하게 둔다.
import { extractIpoPrice } from "../../../domain/index.js";
import type { ListInfoProvider, StockMasterRepository } from "../../port/outbound/index.js";
import type { IpoPriceBackfiller, IpoPriceBackfillResult } from "../../port/inbound/index.js";
import { seoulToday } from "../shared/dailyRange.js";

export interface IpoPriceBackfillDeps {
    listInfo: ListInfoProvider;
    stockMasterRepo: StockMasterRepository;
}

export class IpoPriceBackfillService implements IpoPriceBackfiller {
    constructor(private readonly deps: IpoPriceBackfillDeps) {}

    async backfill(stockCode: string, listingDate: string): Promise<IpoPriceBackfillResult> {
        const { listInfo, stockMasterRepo } = this.deps;
        // 상장일~오늘 — 상장일 행이 반드시 포함됨. 최근 상장이라 슬롯 포화 없음.
        const events = await listInfo.getEvents(stockCode, listingDate, seoulToday());
        const ipoPrice = extractIpoPrice(events, listingDate);
        if (ipoPrice !== null) await stockMasterRepo.updateIpoPrice(stockCode, ipoPrice);
        return { stockCode, listingDate, ipoPrice };
    }
}
