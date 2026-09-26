# 아키텍처 지도 (책임 경계)

> `code-reviewer`·`planner` 서브에이전트와 메인 세션(대화 중)이 함께 참고. 세부 구현이 아니라 "무엇이 어디 책임인지"만 담는다. 세밀하게 다시 쓰지 말고, 구조가 바뀔 때(새 포트/모듈 이동/큰 리팩토링) 그 부분만 한 줄씩 갱신할 것. 여기 없는 세부는 실제 코드(Read/Grep)로 확인 — 이 문서는 "어디를 봐야 하는지"의 내비게이션이지 최종 근거가 아니다. "왜 이렇게 정했는지"는 `.claude/decisions.md` 참고.

## core/market/src — 순수 도메인 (포트 정의 위치)

- **domain/** — 값객체·순수계산: `grain`/`dateRange`/`kst`/`stockCode`, `candle`(model/price/pruning/minuteBackfill), `equity`(stockMaster/dailyStockStat/ipoPrice), `news`, `classification`, `review`(chartAnchor/reviewPoint[키 어휘만]/group/funnel), `grid`(자동 타점 격자: detectGrid 검출(경로 뷰 피벗+기준 밴드) + levelView 마디 뷰 파생 + invariants 불변식 검사 + codec 튜플 + pointsOf 읽기 층 Point 판정 + windows 창 파생·다리 고점 + outcome 결과 걷기), `cellset`(하루·셀 우주의 술어 어휘·셀 평가 엔진 + **테마 술어**(themeZone — ThemeZoneParams(자유 T창·등락 순위|값·당일 누적|창 대금)·themeAnswerOf 판정·옛 themeStrength 저장물 이주 파서)·**돌파 사슬**(breakoutChain — Daily 타점 생성기, 분봉 순회) + **사슬 필터 식**(chainFilter — 봉 조건 AND/OR/NOT + 칩·괄호·꼬리 순번, chainVerdicts)), `expr`(flatExpr — 평평한 식의 구조 규칙 한 벌: 한 겹 괄호·숨은 우선순위 없음·수식어 괄호·접기. 조건판 집합 식과 사슬 필터 식이 같이 쓴다), `rank`, `board`(로스터·유니버스), `replay`(dayReplay)
- **application/port/collect** — 수집 유스케이스 포트. inbound: `MarketDataCollector`, `DailyStatCollector`, `IpoPriceEnricher`, `NewsBackfiller`. outbound: `DailyCandleStore`, `MinuteCandleStore`, `DailyCandleProvider`, `MinuteCandleProvider`, `RawDailyCandleProvider`, `RawDailyStore`, `StockMasterProvider`, `StockMasterStore`, `ListInfoProvider`(공모가 전용), `DailyStockStatsProvider`, `DailyStockStatStore`, `NewsSource`, `StockNewsStore`, `DailyScanRepository`
- **application/port/query** — 읽기 포트. `CandleReader`류, `StockMasterReader`, `DailyMarketCapReader`, `RawDailyReader`, `DailyCommentReader/Store`, `ChartAnchorReader/Store`, `GroupReader/Store`, `NewsSearcher`, `NewsChannelSearch`, `ThemeMembershipProvider/Store`, `DailyUniverseProvider`, `DataDateReader`, `MinuteDateReader`
- **application/service** — 유스케이스 구현체. collect(`DailyCollector`, `MinuteCollector`, `DailyIngestService`, `RawDailyIngestService`, `MarketDataCollectService`, `DailySweepService`, `MinuteSweepService`, `StockMasterIngestService`), marketcap(`DailyStatCollectService` — KRX 날짜 fan-out, 백필=당일 동일 진입점, `IpoPriceBackfillService/EnrichService`), news(`NewsBackfillService`, `NewsSearchService`), axis(기준선거리/매물공백/전일고가 등 랭킹 축 레지스트리)

## infra — core 포트의 어댑터

- **infra/broker/src** — kiwoom/kis SDK를 core 포트로 매핑하는 통합 어댑터 계층: `KiwoomDailyAdapter`/`KiwoomRawDailyCandleAdapter`(→`DailyCandleProvider`류), `KiwoomMinuteAdapter`/`KisMinuteAdapter`/`RoutingMinuteProvider`(→`MinuteCandleProvider`), `KiwoomStockListAdapter`(→`StockMasterProvider`), `KrxDailyStatsAdapter`(→`DailyStockStatsProvider`: 시총·상장주식수·소속부)/`KisListInfoAdapter`(→공모가), `KisNewsAdapter`/`TelegramNewsSearchAdapter`(→`NewsSource`/`NewsSearcher`), `SheetThemeMembershipAdapter`(→`ThemeMembershipProvider`)
- **infra/google/src** — Google API 얇은 IO(도메인 미인지): `auth`, `drive`(`DriveClient`), `sheets`(`SheetsClient`+순수 `matrix` 헬퍼)
- **infra/kis/src**, **infra/kiwoom/src** — 각 증권사 REST SDK 원시 클라이언트(포트 모름): `createKis`/`createKiwoom`, `KisRest`/`KiwoomRest`, `Credential`/`CredentialPool`/`CredentialLease`, `KisError`/`KiwoomError`, 토큰스토어/트랜스포트. kiwoom은 `ws/`(웹소켓) 추가
- **infra/krx/src** — KRX 정보데이터시스템 OPEN API 원시 클라이언트(포트 모름): `createKrx`, `KrxRest.getByddTrd`(일별매매정보 `stk`/`ksq`/`knx`), `KrxError`. 토큰·자격증명 풀 없음(요청마다 헤더 `AUTH_KEY` 하나) → kis/kiwoom 보다 훨씬 얇다. 시총·상장주식수·소속부의 소스
- **infra/persistence/src** — Drizzle 기반 core 리포지토리 포트 구현(전용 `market` 스키마): `Drizzle*Repository`(DailyCandle/RawDailyCandle/MinuteCandle/StockMaster/DailyMarketCap/StockNews/DailyComment/ChartAnchor/Group) + `DrizzleDailyUniverseProvider`, `createDb`, `syncCurationMirror`, `mappers/*`
- **infra/telegram/src** — MTProto(GramJS) 공통 레이어: `createTelegram`(방 검색/게시), `NEWS_CHANNELS`, 재접속 자가치유(`resilient.ts`)

## contracts/wire/src — 서버↔클라 계약

- 도메인별 파일(엔드포인트별 아님): `chart`, `daySummary`, `dayReplay`, `theme`, `comment`, `chartAnchor`, `group`, `rank`, `rankComputed`, `rankPaths`, `news`, `telegramNews`, `stockMeta`, `dataDate`, `live`, `liveTape`, `alerts`, `curationSync`
- 런타임 코드 0, 전부 `export type`. 원칙: core를 그대로 타는 값타입은 core 재노출, 화면 전용 read model만 여기서 정의

## apps/api/src — NestJS

- `market.module.ts` 산하 서브도메인별 컨트롤러: **board**(dates/dayReplay/daySummary/theme) / **chart**(chart) / **curation**(chartAnchor/comment/group/rank/sync) / **news**(news/telegramNews) / **stocks**(stocks)
- 각 그룹 옆에 캐시/read-model 파일 동거: `masterCache`, `derivedCache`(DERIVED_CACHE 단일 인스턴스 — DayBoards 가 쓴다. 옛 RankSections 순위 단면 서버 사전계산은 2026-09-26 은퇴 — 테마 판정은 클라 /day-replay 즉석 계산), `daySnapshotCache`, `grid/`(`pointGrids`+`gridStore`+`pointGrid.controller` — 자동 타점 격자 파일 캐시 대사, `/point-grids` 튜플 서빙 · `labeledPointFacts`+컨트롤러 — 라벨 좌표의 봉 종가·고가 즉석 계산+메모, `/labeled-point-facts`), `chartReadModel`, `computedAxes`

## apps/workbench/src

`api/`(wire 소비 fetch 래퍼) · `store/`(zustand: board/chart/live/rank/filterFunnel(편집 집합 쓰기 — 모드 문지기)/panelUi/dock) · `panels/`(LiveBoard/ThemeBoard/ReplayBoard/Chart/RankSheet/News/Watchlist/Workset, 서브폴더 canvas/dailyExplore(일별 타점[탐색] — 하루 후보 날짜 걷기 + 조건 그룹 열 ●/·, 순수부 exploreRows)/dailyGen(일별 타점[조건] — 하루 조건 묶음·집합, 옛 집합 편성 자리 승계 · gridLink = 돌파 줄↔격자판 연동 판정 한 벌(칩·머리글·평가 결손·차트 출처))/dailyGrid(일별 타점[조건: 격자] — ① 격자 정의 · ② 사슬 필터 식 줄 편집면(그림·수 없음 — 연동 줄을 비추는 창) + 기본 차트 사슬 층 재료 useChainOverlay·「사슬」 판)/filter(식·술어 어휘·보는 집합 — 두 Daily 패널이 쓰는 데이터 층)/group/liveTape/norm/outcome(시그널 결과 패널 — 시그널 이후(미래) 값, filter 와 과거/미래 경계. 결과 시트 패널은 폐지 — 결과 열은 rank 시트의 시트 전용 열)/pointdef(타점 정의 판 — 판정 노브를 분포 보며 긋는 정의 레일 4줄, 모수 선언층)/pointInfo/rank/themeRank(「테마 순위」 View 판 하나 — 산점+자유 자, 깔때기 theme 조건 읽기 전용 겹침(overlay)·「자 값 가져오기」의 자 출처. 편집은 일별 타점[조건]의 테마 팝오버(값=술어 payload), 단면은 sectionSeries 즉석 계산 공용 캐시)) · `chart/`(캔들 렌더링 — 분봉 primitive 층: 세로선·드롭선·다리 표식·**사슬 층**(chainLayer — 돌파 사슬 띠·후보 봉 세로 줄·밴드 면, 재료는 panels/dailyGrid/useChainOverlay)) · `lib/`(hooks+순수 파생로직) · `shell/`(WorkbenchShell, 패널 카탈로그) · `components/`,`ui/`,`keymap/`,`styles/`

## apps/live/src

`live/engine/`(폴링·스캐너·시그널·스냅샷 코어 — `createLiveEngine`, `poller`, `scanner`, `signals`) · `live/alerts/`(`alarmEngine`, 채널 notifier: telegram/mtproto/ntfy, 큐/게이트) · `live/chart/`, `live/tape/`, `live/news/`(각 컨트롤러+로직) · `live/health/monitor` · 컨트롤러: `condition`, `snapshot`, `stream`, `theme`, `health`

## apps/db-ops/src, apps/ingest/src

- `db-ops` — DB 백업/복원/검증/보존/큐레이션동기화 CLI(`backup`, `restore`, `retention`, `verify`, `syncCuration`, `inspect`, gdrive 업로드)
- `ingest` — 수집 파이프라인 CLI 진입점(`cli.ts`) + 컴포지션 루트(`composition.ts`, core 서비스와 infra 어댑터를 실제로 wiring)
