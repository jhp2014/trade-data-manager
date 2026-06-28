// composition root — 헥사고날에서 유일하게 "실물(키움·KIS·Postgres)을 알고 부품에 꽂는" 바깥 껍데기.
// 안쪽(core)·어댑터(infra)는 전부 주입만 받는 레고 블록 → 여기서 한 번 조립한다.
// 다른 진입점(나중 workbench 서버액션·크론)도 같은 함수를 재사용해 동일 서비스를 얻는다.
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { createKis } from "@trade-data-manager/kis";
import {
    KiwoomDailyAdapter,
    KiwoomMinuteAdapter,
    KisMinuteAdapter,
    RoutingMinuteProvider,
    KiwoomStockListAdapter,
} from "@trade-data-manager/broker";
import {
    createDb,
    createPoolFromEnv,
    DrizzleDailyCandleRepository,
    DrizzleMinuteCandleRepository,
    DrizzleStockMasterRepository,
} from "@trade-data-manager/persistence";
import {
    MarketDataIngestService,
    StockMasterIngestService,
    type DailyCandleIngestor,
    type MinuteCandleIngestor,
    type StockMasterIngestor,
} from "@trade-data-manager/market";

export interface IngestRuntime {
    /** 호출자는 유스케이스(inbound 포트)만 본다 — 구현 클래스에 묶이지 않는다. */
    ingest: DailyCandleIngestor & MinuteCandleIngestor;
    /** 유니버스/종목마스터 수집(라이브 ka10099 → stock_master upsert + 스윕용 코드 리스트). */
    universe: StockMasterIngestor;
    /** 보유 리소스(pg 풀) 정리. 프로세스 종료 전 호출. */
    close: () => Promise<void>;
}

/** 외부 핸들 → 어댑터 → 리포 → 유스케이스 서비스 순으로 수동 배선. 각 패키지가 자급 .env 로 설정을 읽는다. */
export function createIngestRuntime(): IngestRuntime {
    const kiwoom = createKiwoom();
    const kis = createKis();
    const pool = createPoolFromEnv();
    const db = createDb(pool);

    // 어댑터: SDK 응답을 도메인 포트(DailyCandleProvider·MinuteCandleProvider)에 맞춘다.
    const dailyProvider = new KiwoomDailyAdapter(kiwoom.rest); // 일봉 = 키움 단독
    const minuteProvider = new RoutingMinuteProvider(
        new KiwoomMinuteAdapter(kiwoom.rest),
        new KisMinuteAdapter(kis.rest),
    ); // 분봉 = 키움·KIS (종목,날) 라우팅

    const dailyRepo = new DrizzleDailyCandleRepository(db);
    const minuteRepo = new DrizzleMinuteCandleRepository(db);

    const ingest = new MarketDataIngestService({
        dailyProvider,
        minuteProvider,
        dailyRepo,
        minuteRepo,
    });

    // 유니버스 = 라이브 ka10099(코스피+코스닥) → stock_master upsert-accumulate.
    const universe = new StockMasterIngestService({
        provider: new KiwoomStockListAdapter(kiwoom.rest),
        repository: new DrizzleStockMasterRepository(db),
    });

    return {
        ingest,
        universe,
        close: async () => {
            await pool.end();
        },
    };
}
