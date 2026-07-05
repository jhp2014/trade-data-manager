// composition root — 실물(키움·KIS·Postgres)을 부품에 꽂는 유일한 바깥 껍데기.
// 공개 표면은 두 inbound 유스케이스: collector(쓰기) · query(읽기). 내부 협력 서비스는 여기서 조립한다.
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { createKis } from "@trade-data-manager/kis";
import { createTelegram, NEWS_CHANNELS, type Telegram } from "@trade-data-manager/telegram";
import {
    KiwoomDailyAdapter,
    KiwoomMinuteAdapter,
    KiwoomStockListAdapter,
    KiwoomMarketSnapshotAdapter,
    KisListInfoAdapter,
    KiwoomRawDailyAdapter,
    KiwoomRawDailyCandleAdapter,
    KiwoomCurrentSharesAdapter,
    KisNewsAdapter,
    TelegramNewsSearchAdapter,
} from "@trade-data-manager/broker";
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyCandleRepository,
    DrizzleRawDailyCandleRepository,
    DrizzleMinuteCandleRepository,
    DrizzleStockMasterRepository,
    DrizzleDailyMarketCapRepository,
    DrizzleStockNewsRepository,
} from "@trade-data-manager/persistence";
import {
    MarketDataIngestService,
    RawDailyIngestService,
    RawDailyBackfillService,
    StockMasterIngestService,
    DailySweepService,
    MinuteSweepService,
    DailyCollector,
    MinuteCollector,
    MarketDataCollectService,
    DailyMarketCapRecordService,
    StockMarketCapBackfillService,
    MarketCapBackfillService,
    NewsBackfillService,
    NewsSearchService,
    type MarketDataCollector,
    type DailyMarketCapRecorder,
    type MarketCapBackfiller,
    type NewsBackfiller,
    type NewsSearcher,
} from "@trade-data-manager/market";

export interface IngestRuntime {
    /** 복기 데이터 수집(Command). 당일/과거/범위/월 전부 collect(range). */
    collector: MarketDataCollector;
    /** 당일 시총 입력(Command). 전일종가 × 현재주식수를 그날 칸에 1행씩. */
    marketCapRecorder: DailyMarketCapRecorder;
    /** 전종목 날짜별 시총 백필(Command). 과거 임의 구간을 KIS 역산+원주가로 재구성. */
    marketCapBackfiller: MarketCapBackfiller;
    /** 전종목 원주가(미수정) 일봉 백필(Command). daily_candles_raw 에 append-only. 분봉 %기준·수정계수 역산용. */
    rawDailyBackfiller: RawDailyBackfillService;
    /** 시황 뉴스 헤드라인 백필(Command). KIS 시황 피드를 연속 역방향 워크로 과거 채움. */
    newsBackfiller: NewsBackfiller;
    /**
     * 텔레그램 뉴스 검색(Query). 등록된 방 전체에 키워드 fan-out. lazy —
     * 처음 부를 때만 Telegram 에 접속한다(수집 명령은 접속 안 함). close 가 끊어준다.
     */
    newsSearcher: () => Promise<NewsSearcher>;
    /** 보유 리소스(pg 풀·telegram) 정리. 프로세스 종료 전 호출. */
    close: () => Promise<void>;
}

export function createIngestRuntime(): IngestRuntime {
    const kiwoom = createKiwoom();
    const kis = createKis(); // 시총 백필의 getListInfo 역산용(당일/수집 경로엔 미사용)
    const pool = createPoolFromEnv();
    const db = createDb(pool);

    // 어댑터(포트 구현)
    const dailyProvider = new KiwoomDailyAdapter(kiwoom.rest); // 일봉 = 키움 단독
    // 분봉 = 키움 단독. 키움이 KIS보다 보유범위 넓고(최古 2025-06-02 < KIS D-375) 콜당 봉 수 많아 빠르며 누락 0.
    // KIS 는 차트에서 느림+~15% 누락이라 제외(어댑터·패키지는 휴면 보존). 포트는 그대로라 필요 시 배선만 교체.
    const minuteProvider = new KiwoomMinuteAdapter(kiwoom.rest);
    const dailyRepo = new DrizzleDailyCandleRepository(db);
    const rawDailyProvider = new KiwoomRawDailyCandleAdapter(kiwoom.rest); // 원주가 일봉(upd_stkpc_tp:"0", KRX+_AL)
    const rawDailyRepo = new DrizzleRawDailyCandleRepository(db);
    const minuteRepo = new DrizzleMinuteCandleRepository(db);
    const stockMasterRepo = new DrizzleStockMasterRepository(db);
    const marketCapRepo = new DrizzleDailyMarketCapRepository(db);

    // 내부 협력 서비스
    const universe = new StockMasterIngestService({
        provider: new KiwoomStockListAdapter(kiwoom.rest),
        repository: stockMasterRepo,
    });
    const dailyIngest = new MarketDataIngestService({ dailyProvider, dailyRepo });
    // 원주가 일봉 ingest — 종목별 append-only(자가치유 없음). DailySweep 가 종목당 수정주가와 함께 둘 다.
    const rawDailyIngest = new RawDailyIngestService({ rawProvider: rawDailyProvider, rawRepo: rawDailyRepo });
    const dailySweep = new DailySweepService({ dailyIngest, rawDailyIngest });
    // 원주가 일봉 백필(독립 커맨드) — 유니버스 fan-out + 종목별 append-only ingest.
    const rawDailyBackfiller = new RawDailyBackfillService({ universe, rawIngest: rawDailyIngest });
    const minuteSweep = new MinuteSweepService({ scanRepo: dailyRepo, minuteProvider, minuteRepo });

    // 공개 유스케이스 — collect()/backfill(range) composer 가 일봉·분봉 collector 를 순차 조립.
    const dailyCollector = new DailyCollector({ universe, dailySweep, scanRepo: dailyRepo });
    const minuteCollector = new MinuteCollector({ scanRepo: dailyRepo, minuteSweep, minuteRepo });
    const collector = new MarketDataCollectService({ dailyCollector, minuteCollector });
    // 당일 시총 = ka10099 한 스윕(전일종가×현재주식수). KIS·역산 불필요 → 키움 단독.
    const marketCapRecorder = new DailyMarketCapRecordService({
        snapshot: new KiwoomMarketSnapshotAdapter(kiwoom.rest),
        repo: marketCapRepo,
    });
    // 전종목 날짜별 시총 백필 = 단일종목 백필(KIS 역산 + 키움 원주가 + 현재주식수 폴백)을 거래종목에 fan-out.
    const stockMarketCapBackfill = new StockMarketCapBackfillService({
        listInfo: new KisListInfoAdapter(kis.rest),
        rawDaily: new KiwoomRawDailyAdapter(kiwoom.rest),
        currentShares: new KiwoomCurrentSharesAdapter(kiwoom.rest),
        repo: marketCapRepo,
    });
    const marketCapBackfiller = new MarketCapBackfillService({
        stockBackfill: stockMarketCapBackfill,
        scanRepo: dailyRepo,
    });
    // 시황 뉴스 백필 = KIS 시황 피드(전부, 종목 미태깅 포함)를 시각앵커 연속 워크로 긁어 stock_news 에 적재.
    const newsBackfiller = new NewsBackfillService({
        source: new KisNewsAdapter(kis.rest),
        repo: new DrizzleStockNewsRepository(db),
    });

    // 텔레그램 뉴스 검색 = 등록 방(NEWS_CHANNELS) 전체에 키워드 fan-out. lazy 접속(검색 명령에서만).
    let telegram: Telegram | null = null;
    let searcher: NewsSearcher | null = null;
    const newsSearcher = async (): Promise<NewsSearcher> => {
        if (!searcher) {
            telegram = await createTelegram();
            const labels = new Map(NEWS_CHANNELS.map((c) => [c.peer, c.label]));
            searcher = new NewsSearchService({
                source: new TelegramNewsSearchAdapter(telegram, labels),
                channels: NEWS_CHANNELS.map((c) => c.peer),
            });
        }
        return searcher;
    };

    return {
        collector,
        marketCapRecorder,
        marketCapBackfiller,
        rawDailyBackfiller,
        newsBackfiller,
        newsSearcher,
        close: async () => {
            if (telegram) await telegram.disconnect();
            await pool.end();
        },
    };
}
