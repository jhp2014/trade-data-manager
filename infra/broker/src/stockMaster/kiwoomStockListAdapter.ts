// infra/broker/stockMaster/kiwoomStockListAdapter — 키움 ka10099 → 도메인 StockMaster.
// 코스피·코스닥 두 시장을 각 1콜로 받아 합친다. marketName 필터(개별주식만)는 SDK getStockList 내장.
import type { StockMaster, StockMasterProvider } from "@trade-data-manager/market";
import type { KiwoomKa10099Entry } from "@trade-data-manager/kiwoom";

/** 어댑터가 키움에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). */
export interface KiwoomStockListSource {
    getStockList(marketCode: string): Promise<KiwoomKa10099Entry[]>;
}

/** 키움 mrkt_tp: 0=코스피(거래소), 10=코스닥. */
const MARKET_CODES = ["0", "10"] as const;

/** "YYYYMMDD" → "YYYY-MM-DD". 8자리 숫자 아니면 null(상장일 미상). */
function toIsoDate(raw: string): string | null {
    if (!/^\d{8}$/.test(raw)) return null;
    return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
}

function toStockMaster(e: KiwoomKa10099Entry): StockMaster {
    return {
        stockCode: e.code,
        name: e.name,
        market: e.marketName,
        listingDate: toIsoDate(e.regDay),
        ipoPrice: null, // ka10099 엔 없음 — list-info enrichment 가 채움
    };
}

export class KiwoomStockListAdapter implements StockMasterProvider {
    constructor(private readonly source: KiwoomStockListSource) {}

    async listStockMasters(): Promise<StockMaster[]> {
        const lists = await Promise.all(MARKET_CODES.map((c) => this.source.getStockList(c)));
        return lists.flat().map(toStockMaster);
    }
}
