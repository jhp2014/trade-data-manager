# 아키텍처 지도 (책임 경계)

> `code-reviewer`·`planner` 서브에이전트와 메인 세션(대화 중)이 함께 참고. 세부 구현이 아니라 "무엇이 어디 책임인지"만 담는다. 세밀하게 다시 쓰지 말고, 구조가 바뀔 때(새 포트/모듈 이동/큰 리팩토링) 그 부분만 한 줄씩 갱신할 것. 여기 없는 세부는 실제 코드(Read/Grep)로 확인 — 이 문서는 "어디를 봐야 하는지"의 내비게이션이지 최종 근거가 아니다. "왜 이렇게 정했는지"는 `.claude/decisions.md` 참고.

## core/market/src — 순수 도메인 (포트 정의 위치)

- **domain/** — 값객체·순수계산: `grain`/`dateRange`/`kst`/`stockCode`, `candle`(model/price/pruning/minuteBackfill), `equity`(stockMaster/marketCap/ipoPrice), `news`, `classification`, `review`(chartAnchor/reviewPoint[키 어휘만]/group/funnel), `grid`(자동 타점 격자: detectGrid 검출 + pointsOf 읽기 층 Point 판정), `rank`, `board`(로스터·유니버스), `replay`(dayReplay)
- **application/port/collect** — 수집 유스케이스 포트. inbound: `MarketDataCollector`, `DailyMarketCapRecorder`, `IpoPriceEnricher`, `MarketCapBackfiller`, `NewsBackfiller`. outbound: `DailyCandleStore`, `MinuteCandleStore`, `DailyCandleProvider`, `MinuteCandleProvider`, `RawDailyCandleProvider`, `RawDailyStore`, `StockMasterProvider`, `StockMasterStore`, `CurrentSharesProvider`, `ListInfoProvider`, `MarketSnapshotProvider`, `MarketCapStore`, `NewsSource`, `StockNewsStore`, `DailyScanRepository`
- **application/port/query** — 읽기 포트. `CandleReader`류, `StockMasterReader`, `DailyMarketCapReader`, `RawDailyReader`, `DailyCommentReader/Store`, `ChartAnchorReader/Store`, `GroupReader/Store`, `NewsSearcher`, `NewsChannelSearch`, `ThemeMembershipProvider/Store`, `DailyUniverseProvider`, `DataDateReader`, `MinuteDateReader`
- **application/service** — 유스케이스 구현체. collect(`DailyCollector`, `MinuteCollector`, `DailyIngestService`, `RawDailyIngestService`, `MarketDataCollectService`, `DailySweepService`, `MinuteSweepService`, `StockMasterIngestService`), marketcap(`DailyMarketCapRecordService`, `IpoPriceBackfillService/EnrichService`, `MarketCapBackfillService`, `StockMarketCapBackfillService`), news(`NewsBackfillService`, `NewsSearchService`), axis(기준선거리/매물공백/전일고가 등 랭킹 축 레지스트리)

## infra — core 포트의 어댑터

- **infra/broker/src** — kiwoom/kis SDK를 core 포트로 매핑하는 통합 어댑터 계층: `KiwoomDailyAdapter`/`KiwoomRawDailyCandleAdapter`(→`DailyCandleProvider`류), `KiwoomMinuteAdapter`/`KisMinuteAdapter`/`RoutingMinuteProvider`(→`MinuteCandleProvider`), `KiwoomStockListAdapter`(→`StockMasterProvider`), `KisListInfoAdapter`/`KiwoomCurrentSharesAdapter`/`KiwoomMarketSnapshotAdapter`(→시총), `KisNewsAdapter`/`TelegramNewsSearchAdapter`(→`NewsSource`/`NewsSearcher`), `SheetThemeMembershipAdapter`(→`ThemeMembershipProvider`)
- **infra/google/src** — Google API 얇은 IO(도메인 미인지): `auth`, `drive`(`DriveClient`), `sheets`(`SheetsClient`+순수 `matrix` 헬퍼)
- **infra/kis/src**, **infra/kiwoom/src** — 각 증권사 REST SDK 원시 클라이언트(포트 모름): `createKis`/`createKiwoom`, `KisRest`/`KiwoomRest`, `Credential`/`CredentialPool`/`CredentialLease`, `KisError`/`KiwoomError`, 토큰스토어/트랜스포트. kiwoom은 `ws/`(웹소켓) 추가
- **infra/persistence/src** — Drizzle 기반 core 리포지토리 포트 구현(전용 `market` 스키마): `Drizzle*Repository`(DailyCandle/RawDailyCandle/MinuteCandle/StockMaster/DailyMarketCap/StockNews/DailyComment/ChartAnchor/Group) + `DrizzleDailyUniverseProvider`, `createDb`, `syncCurationMirror`, `mappers/*`
- **infra/telegram/src** — MTProto(GramJS) 공통 레이어: `createTelegram`(방 검색/게시), `NEWS_CHANNELS`, 재접속 자가치유(`resilient.ts`)

## contracts/wire/src — 서버↔클라 계약

- 도메인별 파일(엔드포인트별 아님): `chart`, `daySummary`, `dayReplay`, `theme`, `comment`, `chartAnchor`, `group`, `rank`, `rankComputed`, `rankPaths`, `rankSection`, `news`, `telegramNews`, `stockMeta`, `dataDate`, `live`, `liveTape`, `alerts`, `curationSync`
- 런타임 코드 0, 전부 `export type`. 원칙: core를 그대로 타는 값타입은 core 재노출, 화면 전용 read model만 여기서 정의

## apps/api/src — NestJS

- `market.module.ts` 산하 서브도메인별 컨트롤러: **board**(dates/dayReplay/daySummary/theme/rankSection) / **chart**(chart) / **curation**(chartAnchor/comment/group/rank/sync) / **news**(news/telegramNews) / **stocks**(stocks)
- 각 그룹 옆에 캐시/read-model 파일 동거: `masterCache`, `derivedCache`(DERIVED_CACHE 단일 인스턴스 — DayBoards·RankSections 공유), `daySnapshotCache`, `rankSections`+`rankSectionStore`((날짜,분) 순위 단면 대사), `grid/`(`pointGrids`+`gridStore`+`pointGrid.controller` — 자동 타점 격자 파일 캐시 대사, `/point-grids` 튜플 서빙), `chartReadModel`, `computedAxes`

## apps/workbench/src

`api/`(wire 소비 fetch 래퍼) · `store/`(zustand: board/chart/live/rank/filterFunnel/panelUi/dock) · `panels/`(LiveBoard/ThemeBoard/ReplayBoard/Chart/RankSheet/News/Watchlist/FilterFunnel/Workset, 서브폴더 canvas/filter/group/liveTape/norm/rank) · `chart/`(캔들 렌더링) · `lib/`(hooks+순수 파생로직) · `shell/`(WorkbenchShell, 패널 카탈로그) · `components/`,`ui/`,`keymap/`,`styles/`

## apps/live/src

`live/engine/`(폴링·스캐너·시그널·스냅샷 코어 — `createLiveEngine`, `poller`, `scanner`, `signals`) · `live/alerts/`(`alarmEngine`, 채널 notifier: telegram/mtproto/ntfy, 큐/게이트) · `live/chart/`, `live/tape/`, `live/news/`(각 컨트롤러+로직) · `live/health/monitor` · 컨트롤러: `condition`, `snapshot`, `stream`, `theme`, `health`

## apps/db-ops/src, apps/ingest/src

- `db-ops` — DB 백업/복원/검증/보존/큐레이션동기화 CLI(`backup`, `restore`, `retention`, `verify`, `syncCuration`, `inspect`, gdrive 업로드)
- `ingest` — 수집 파이프라인 CLI 진입점(`cli.ts`) + 컴포지션 루트(`composition.ts`, core 서비스와 infra 어댑터를 실제로 wiring)
