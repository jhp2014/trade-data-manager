// composition root — 실물(키움·KIS·Postgres)을 부품에 꽂는 유일한 바깥 껍데기.
// 공개 표면은 두 inbound 유스케이스: collector(쓰기) · query(읽기). 내부 협력 서비스는 여기서 조립한다.
import { createKiwoom } from "@trade-data-manager/kiwoom";
import {
    KiwoomDailyAdapter,
    KiwoomMinuteAdapter,
    KiwoomStockListAdapter,
    KiwoomMarketSnapshotAdapter,
} from "@trade-data-manager/broker";
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyCandleRepository,
    DrizzleMinuteCandleRepository,
    DrizzleStockMasterRepository,
    DrizzleDailyMarketCapRepository,
} from "@trade-data-manager/persistence";
import {
    MarketDataIngestService,
    StockMasterIngestService,
    DailySweepService,
    MinuteSweepService,
    MarketDataCollectService,
    DailyMarketCapRecordService,
    type MarketDataCollector,
    type DailyMarketCapRecorder,
} from "@trade-data-manager/market";

export interface IngestRuntime {
    /** 복기 데이터 수집(Command). 당일/과거/범위/월 전부 collect(range). */
    collector: MarketDataCollector;
    /** 당일 시총 입력(Command). 전일종가 × 현재주식수를 그날 칸에 1행씩. */
    marketCapRecorder: DailyMarketCapRecorder;
    /** 보유 리소스(pg 풀) 정리. 프로세스 종료 전 호출. */
    close: () => Promise<void>;
}

export function createIngestRuntime(): IngestRuntime {
    const kiwoom = createKiwoom();
    const pool = createPoolFromEnv();
    const db = createDb(pool);

    // 어댑터(포트 구현)
    const dailyProvider = new KiwoomDailyAdapter(kiwoom.rest); // 일봉 = 키움 단독
    // 분봉 = 키움 단독. 키움이 KIS보다 보유범위 넓고(최古 2025-06-02 < KIS D-375) 콜당 봉 수 많아 빠르며 누락 0.
    // KIS 는 차트에서 느림+~15% 누락이라 제외(어댑터·패키지는 휴면 보존). 포트는 그대로라 필요 시 배선만 교체.
    const minuteProvider = new KiwoomMinuteAdapter(kiwoom.rest);
    const dailyRepo = new DrizzleDailyCandleRepository(db);
    const minuteRepo = new DrizzleMinuteCandleRepository(db);
    const stockMasterRepo = new DrizzleStockMasterRepository(db);
    const marketCapRepo = new DrizzleDailyMarketCapRepository(db);

    // 내부 협력 서비스
    const universe = new StockMasterIngestService({
        provider: new KiwoomStockListAdapter(kiwoom.rest),
        repository: stockMasterRepo,
    });
    const dailyIngest = new MarketDataIngestService({ dailyProvider, minuteProvider, dailyRepo, minuteRepo });
    const dailySweep = new DailySweepService({ dailyIngest });
    const minuteSweep = new MinuteSweepService({ scanRepo: dailyRepo, minuteProvider, minuteRepo });

    // 공개 유스케이스
    const collector = new MarketDataCollectService({ universe, dailySweep, minuteSweep, scanRepo: dailyRepo, minuteRepo });
    // 당일 시총 = ka10099 한 스윕(전일종가×현재주식수). KIS·역산 불필요 → 키움 단독.
    const marketCapRecorder = new DailyMarketCapRecordService({
        snapshot: new KiwoomMarketSnapshotAdapter(kiwoom.rest),
        repo: marketCapRepo,
    });

    return {
        collector,
        marketCapRecorder,
        close: async () => {
            await pool.end();
        },
    };
}
