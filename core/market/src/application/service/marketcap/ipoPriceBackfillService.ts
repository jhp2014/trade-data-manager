// IpoPriceBackfillService — 단일종목 공모가 추출(내부 협력자). 유니버스 enrich(IpoPriceEnrichService)가 fan-out 한다.
// 협력: ListInfoProvider(예탁원 상장정보일정) · StockMasterStore(공모가 갱신).
// 흐름: ① [상장일, 오늘] list-info 조회  ② extractIpoPrice(상장일 유상증자 행)  ③ 있으면 stock_master 갱신.
// 시총 백필과 소스(getListInfo)는 같지만, 일회성이라 fetch 를 공유하지 않고 각자 호출해 로직을 단순하게 둔다.
import { extractIpoPrice } from "#domain";
import type { ListInfoProvider, StockMasterStore } from "#port/collect";
import { seoulToday } from "../shared/dailyRange.js";

/** 단일종목 공모가 추출 결과(내부 — enrich 서비스가 filled 를 집계). */
export interface IpoPriceBackfillResult {
    stockCode: string;
    listingDate: string;
    /** 추출한 공모가(원). 상장일 유상증자 행이 없으면 null. */
    ipoPrice: string | null;
}

export interface IpoPriceBackfillDeps {
    listInfo: ListInfoProvider;
    stockMasterRepo: StockMasterStore;
}

export class IpoPriceBackfillService {
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
