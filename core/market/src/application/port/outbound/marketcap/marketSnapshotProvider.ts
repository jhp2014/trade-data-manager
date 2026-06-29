import type { MarketSnapshot } from "../../../../domain/index.js";

/**
 * 전종목 시장 스냅샷 제공 포트(ISP — 당일 시총 입력용).
 * 구현은 키움 ka10099 한 스윕(상장주식수 listCount + 전일종가 lastPrice). 개별주식 필터는 어댑터/SDK 책임.
 * 백필(getListInfo 역산 + 원주가 per-stock)과 달리 전종목이 단일 스윕으로 끝난다.
 */
export interface MarketSnapshotProvider {
    getMarketSnapshot(): Promise<MarketSnapshot[]>;
}
