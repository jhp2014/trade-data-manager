// IpoPriceEnrichService — 유니버스 공모가 enrichment(공개, inbound IpoPriceEnricher 구현).
// 실행 시점 기준 최근 1년 상장 & ipoPrice 빈 종목을 stock_master 에서 뽑아 단일종목 IpoPriceBackfillService 로 fan-out.
// 종목 실패 격리. steady-state 는 신규상장(공모가 null)만 남으므로 대상이 소수 — 일상 수집에 붙여도 저렴.
import { subtractMonths, seoulToday } from "../shared/dailyRange.js";
import type { StockMasterRepository } from "#port/outbound";
import type { IpoPriceEnricher, IpoPriceEnrichResult } from "#port/inbound";
import { mapWithConcurrency } from "../../concurrency.js";
import type { IpoPriceBackfillService } from "./ipoPriceBackfillService.js";

const DEFAULT_CONCURRENCY = 8;
/** 대상 상장 창 — 실행 시점 기준 과거 개월수. 이보다 오래된 상장은 채우지 않는다. */
const LOOKBACK_MONTHS = 12;

export interface IpoPriceEnrichDeps {
    stockMasterRepo: StockMasterRepository;
    /** 단일종목 공모가 추출(내부 협력자) — 대상 종목에 fan-out 한다. */
    stockBackfill: IpoPriceBackfillService;
    /** 오늘(YYYY-MM-DD) 공급자. 기본 = Asia/Seoul 현재일. 1년 컷오프 산정용 — 주입 시 테스트 결정성↑. */
    today?: () => string;
}

export class IpoPriceEnrichService implements IpoPriceEnricher {
    private readonly today: () => string;

    constructor(private readonly deps: IpoPriceEnrichDeps) {
        this.today = deps.today ?? seoulToday;
    }

    async enrichAll(): Promise<IpoPriceEnrichResult> {
        const { stockMasterRepo, stockBackfill } = this.deps;
        const listedSince = subtractMonths(this.today(), LOOKBACK_MONTHS);
        const targets = await stockMasterRepo.listNeedingIpoPrice(listedSince);

        const failed: string[] = [];
        let filled = 0;
        await mapWithConcurrency(targets, DEFAULT_CONCURRENCY, async (t) => {
            try {
                const r = await stockBackfill.backfill(t.stockCode, t.listingDate);
                if (r.ipoPrice !== null) filled++;
            } catch {
                failed.push(t.stockCode); // 종목 실패 격리
            }
        });

        return { needing: targets.length, filled, failed };
    }
}
