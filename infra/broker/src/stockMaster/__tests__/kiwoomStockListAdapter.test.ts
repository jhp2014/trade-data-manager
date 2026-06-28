import { describe, it, expect } from "vitest";
import { KiwoomStockListAdapter, type KiwoomStockListSource } from "../kiwoomStockListAdapter.js";
import type { KiwoomKa10099Entry } from "@trade-data-manager/kiwoom";

const entry = (code: string, name: string, marketName: string, regDay: string): KiwoomKa10099Entry => ({
    code,
    name,
    listCount: "1000",
    auditInfo: "정상",
    regDay,
    lastPrice: "100",
    state: "",
    marketCode: "0",
    marketName,
    upName: "",
    upSizeName: "",
    companyClassName: "",
    orderWarning: "",
    nxtEnable: "Y",
    kind: "A",
});

describe("KiwoomStockListAdapter", () => {
    it("코스피(0)+코스닥(10) 두 콜을 합쳐 StockMaster 로 매핑", async () => {
        const byMarket: Record<string, KiwoomKa10099Entry[]> = {
            "0": [entry("005930", "삼성전자", "거래소", "19750611")],
            "10": [entry("247540", "에코프로비엠", "코스닥", "20190305")],
        };
        const source: KiwoomStockListSource = {
            getStockList: async (marketCode) => byMarket[marketCode] ?? [],
        };
        const masters = await new KiwoomStockListAdapter(source).listStockMasters();

        expect(masters).toEqual([
            { stockCode: "005930", name: "삼성전자", market: "거래소", listingDate: "1975-06-11", ipoPrice: null },
            { stockCode: "247540", name: "에코프로비엠", market: "코스닥", listingDate: "2019-03-05", ipoPrice: null },
        ]);
    });

    it("regDay 가 8자리 숫자 아니면 listingDate=null", async () => {
        const source: KiwoomStockListSource = {
            getStockList: async (mc) => (mc === "0" ? [entry("000000", "x", "거래소", "")] : []),
        };
        const [m] = await new KiwoomStockListAdapter(source).listStockMasters();
        expect(m.listingDate).toBeNull();
    });
});
