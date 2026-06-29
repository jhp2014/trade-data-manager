// infra/broker/marketCap/kiwoomMarketSnapshotAdapter — 키움 ka10099 → MarketSnapshotProvider.
// 당일 시총용: 코스피·코스닥 두 시장을 각 1콜로 받아(getStockList 가 개별주식 필터 내장) listCount·lastPrice 만 꺼낸다.
// 실측(recon 09): listCount=주(정확값, ka10001 flo_stk 의 천주와 단위 다름), lastPrice=직전거래일 종가(원, 0패딩).
import type { MarketSnapshot, MarketSnapshotProvider } from "@trade-data-manager/market";
import type { KiwoomKa10099Entry } from "@trade-data-manager/kiwoom";

/** 어댑터가 키움에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). */
export interface KiwoomMarketListSource {
    getStockList(marketCode: string): Promise<KiwoomKa10099Entry[]>;
}

/** 키움 mrkt_tp: 0=코스피(거래소), 10=코스닥. */
const MARKET_CODES = ["0", "10"] as const;

/** 0패딩·부호 제거 → 순수 정수 문자열. 빈값은 "0". */
const num = (s: string): string => String(s ?? "").replace(/^[+-]/, "").trim() || "0";

export class KiwoomMarketSnapshotAdapter implements MarketSnapshotProvider {
    constructor(private readonly source: KiwoomMarketListSource) {}

    async getMarketSnapshot(): Promise<MarketSnapshot[]> {
        const lists = await Promise.all(MARKET_CODES.map((c) => this.source.getStockList(c)));
        return lists.flat().map((e) => ({
            stockCode: e.code,
            shares: num(e.listCount),
            prevClose: num(e.lastPrice),
        }));
    }
}
