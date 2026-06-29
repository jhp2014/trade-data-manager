// infra/broker/marketCap/kiwoomCurrentSharesAdapter — 키움 ka10001(flo_stk) → CurrentSharesProvider.
// 역산 폴백: 예탁원 이벤트 0건 종목의 상수 shares. flo_stk 는 천주 단위(실측: 삼성 5,846,279 ×1000 = 현재총수,
//   ka10001 mac 과도 교차검증). 천주→주 보정(×1000)은 여기서. 소오차(천주 미만 절사)는 시총상 무시 가능.
import type { CurrentSharesProvider } from "@trade-data-manager/market";
import type { KiwoomKa10001Response } from "@trade-data-manager/kiwoom";

/** 어댑터가 키움에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). */
export interface KiwoomBasicInfoSource {
    getBasicInfo(stockCode: string): Promise<{ data: KiwoomKa10001Response }>;
}

export class KiwoomCurrentSharesAdapter implements CurrentSharesProvider {
    constructor(private readonly source: KiwoomBasicInfoSource) {}

    async getCurrentShares(stockCode: string): Promise<string | null> {
        const res = await this.source.getBasicInfo(stockCode);
        const flo = (res.data.flo_stk ?? "").trim();
        if (!flo || flo === "0") return null;
        return (BigInt(flo) * 1000n).toString(); // 천주 → 주
    }
}
