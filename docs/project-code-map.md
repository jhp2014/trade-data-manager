# 프로젝트 코드 지도

이 문서는 `trade-data-manager`를 처음 다시 읽을 때 “무엇이 어디에 있고, 어떤 데이터가 어디로 흐르는지”를 빠르게 잡기 위한 한글 지도입니다.

## 1. 전체 흐름

```text
CSV 입력
  |
  v
apps/batch
  - 키움 API에서 종목/일봉/분봉 수집
  - 테마 매핑 저장
  |
  v
packages/data-core
  - Drizzle schema
  - repository/upsert/read API
  - chart-review용 묶음 query
  |
  v
apps/feature-processor
  - minute_candles를 읽음
  - MINUTE_CALCULATORS로 minute_candle_features 계산
  |
  +--------------------------+
  |                          |
  v                          v
apps/chart-review        apps/chart-capture
  - DB 기반 복기 UI          - CSV 기반 PNG 캡처
  - 타점 입력/필터/시트      - Next 화면 + Playwright
```

핵심 원칙은 `data-core`가 데이터 구조의 중심이라는 점입니다. 앱은 각자 UI, CLI, 파일 처리, 브라우저 자동화 같은 실행 책임을 갖고, DB 스키마와 공용 읽기/쓰기 함수는 `packages/data-core`에 모여 있습니다.

## 2. 모노레포 구조

```text
apps/
  batch/              데이터 수집 CLI
  feature-processor/  분봉 피처 계산 CLI
  chart-review/       복기 웹 UI, 포트 3200
  chart-capture/      차트 PNG 캡처 앱/CLI, 포트 3939

packages/
  data-core/          DB 스키마, repository, query, 피처 계산기, review sheet 변환
  chart-utils/        차트 시간/패딩/마커/색상 등 차트 앱 공유 유틸
  tsconfig/           공통 TypeScript 설정
```

## 3. 앱별 책임과 코드 응집

| 영역 | 주요 책임 | 코드가 모인 곳 | 유지보수 관점 |
|------|-----------|----------------|---------------|
| 데이터 수집 | CSV를 읽고 키움 API로 원천 데이터 적재 | `apps/batch/src/services`, `apps/batch/src/clients` | 파일 처리, API 호출, 도메인 조립, DB 저장이 레이어별로 나뉨 |
| DB/도메인 중심 | 스키마, upsert, read query, 피처 계산기 | `packages/data-core/src` | 모든 앱이 공유하는 SSOT. 스키마 변경은 여기에서 시작 |
| 피처 가공 | 분봉에서 지표 생성 | `apps/feature-processor/src/runner.ts`, `packages/data-core/src/market-feature` | 실행 파이프라인은 앱, 계산기 정의는 data-core |
| 복기 UI | 작업셋 탐색, 차트, 타점 입력, Sheet 연동 | `apps/chart-review/src` | UI 상태는 store/hook, 도메인 로직은 `lib`, 화면은 `components` |
| PNG 캡처 | CSV job을 차트 이미지로 저장 | `apps/chart-capture/src/pipeline`, `src/app/capture` | CLI 파이프라인과 캡처 페이지가 분리되어 디버깅 쉬움 |
| 차트 공통 | 분봉 누락 보간, 시간 정규화, 마커 유틸 | `packages/chart-utils/src` | chart-review와 chart-capture가 공유 가능한 순수 유틸 |

## 4. 데이터 수집: apps/batch

```text
src/index.ts
  -> csvBatchService.processFolder(CSV_FOLDER)
    -> csvBatchService.processFile(file)
      -> parseCsvFile(file)
      -> marketService.syncStockInfo(stockCode)
      -> marketService.syncDailyCandles(stockCode, apiDate)
      -> marketService.syncMinuteCandles(stockCode, tradeDate)
      -> marketService.clearThemeMappings(stockCode, tradeDate)
      -> marketService.syncThemeMapping(stockCode, tradeDate, themeName)
```

`apps/batch`의 응집 기준은 “외부 I/O의 종류”입니다.

| 파일/폴더 | 역할 |
|-----------|------|
| `src/index.ts` | `.env` 로드, CSV 폴더 결정, 배치 시작/종료 코드 처리 |
| `src/services/csv/csvBatchService.ts` | CSV 폴더 순회, 파일별 처리, 성공/실패 이동 |
| `src/services/csv/csvParserService.ts` | CSV 행 파싱, 같은 종목의 여러 테마를 `Set`으로 그룹핑 |
| `src/services/marketService.ts` | 수집 순서 오케스트레이션. 키움 호출 후 data-core repository 호출 |
| `src/clients/kiwoomClient.ts` | 키움 REST API 호출, 토큰, rate limit, 페이지네이션 |
| `src/services/assemblers/candleAssembler.ts` | 배열 단위 규칙. 일봉 KRX/NXT 결합, 분봉 날짜 필터/정렬/누적 계산 |
| `src/services/mappers/marketDataMapper.ts` | 키움 row 1개를 DB insert 타입으로 변환 |
| `src/services/mappers/utils` | 숫자/날짜/가격 계산 순수 유틸 |
| `src/repository/db.ts` | `DATABASE_URL`로 DB pool과 data-core `createDb()` 연결 |

예시 흐름:

```csv
테마명,종목코드,종목명
반도체,005930,삼성전자
AI,005930,삼성전자
```

이 CSV는 `parseCsvFile()` 뒤에 개념적으로 다음처럼 묶입니다.

```ts
Map([
  ["005930", { stockName: "삼성전자", themes: Set(["반도체", "AI"]) }],
])
```

그 뒤 `MarketService`는 종목 정보, 일봉 600개, 거래일 분봉, 테마 매핑을 차례대로 저장합니다. 저장 함수는 대부분 `data-core`의 upsert라서 같은 CSV를 재실행해도 기존 row를 덮어쓰는 방식으로 동작합니다.

## 5. DB 중심: packages/data-core

`data-core`는 아래 다섯 묶음으로 읽으면 됩니다.

| 묶음 | 파일 | 설명 |
|------|------|------|
| DB 팩토리 | `src/db.ts` | `pg.Pool`을 받아 Drizzle DB 객체 생성 |
| 스키마 | `src/schema/*.ts` | market/review/features 테이블 정의 |
| 저장소 | `src/repositories/*.ts` | upsert, 단건/벌크 조회, review point 조작 |
| 화면용 query | `src/queries/theme-bundle.ts` | chart-review 차트 번들 1회 조회 |
| 피처 계산기 | `src/market-feature` | `minute_candle_features` 컬럼과 계산 로직 |
| Sheet 변환 | `src/review-sheet` | review export 행을 Google Sheet matrix로 변환 |

상세 함수별 입출력 예시는 [data-core API 레퍼런스](../packages/data-core/docs/api-reference.md)를 보세요.

## 6. 피처 가공: apps/feature-processor

```text
src/index.ts
  -> resolveDates(--date / --all / --pending)
  -> runMinuteFeatures({ db, tradeDate })
    -> findDistinctStockCodesByDate()
    -> 종목별 findMinuteCandlesByStockAndDate()
    -> computeStockFeatures()
      -> 모든 MINUTE_CALCULATORS reset()
      -> 각 분봉마다 calculate(ctx)
      -> mergeCalculatorOutputs()
    -> saveMinuteFeatures()
```

실제 지표 정의는 `packages/data-core/src/market-feature/calculators`에 있고, 실행은 `apps/feature-processor/src/runner.ts`에 있습니다. 즉 “무슨 지표를 계산하는가”는 data-core, “언제 어떤 날짜를 돌리는가”는 feature-processor가 책임집니다.

## 7. 복기 UI: apps/chart-review

`chart-review`는 데이터 로딩, 차트 번들 조회, UI 상태, 입력/시트 연동이 서로 섞이지 않도록 다음처럼 나뉩니다.

| 기능 | 코드 위치 |
|------|-----------|
| 최초 페이지 진입/리다이렉트 | `src/app/page.tsx` |
| 메인 복기 라우트 | `src/app/review/[code]/[date]/[time]/page.tsx` |
| 작업셋 로딩 | `src/lib/loadReviewRows.ts`, `src/lib/workingSet.ts`, `src/hooks/useWorkingSetCache.ts` |
| 그룹/타점 선택 명령 | `src/lib/reviewCommands.ts`, `src/lib/selection.ts`, `src/lib/url.ts` |
| 메인 화면 조립 | `src/components/review/ReviewWorkspace.tsx` |
| 전역 단축키 | `src/lib/shortcuts.ts`, `src/hooks/useGlobalShortcuts.ts` |
| UI 상태 | `src/stores/useReviewStore.ts`, `src/stores/useUiStore.ts` |
| 차트 데이터 조회 | `src/app/api/chart-preview/route.ts`, `src/lib/chart/loadChartPreview.ts` |
| 차트 렌더 | `src/components/chart/*`, `src/components/chart/hooks/*` |
| 타점 입력 | `src/components/review/PointInputDrawer.tsx`, `src/app/api/review/point/route.ts` |
| 수동 키 레지스트리 | `src/app/api/review/manual-keys/route.ts`, data-core `review.repository.ts` |
| Sheet 읽기/쓰기 | `src/actions/sheet.ts`, `src/lib/sheetsWriter.ts`, `src/app/api/review/*` |
| 설정 모달 | `src/components/review/modals/SettingsModal.tsx`와 하위 모달 |

더 자세한 기능별 지도와 최신 단축키는 [chart-review 코드 지도](../apps/chart-review/docs/code-map.md), [사용법](../apps/chart-review/docs/usage.md)을 보세요.

## 8. 차트 캡처: apps/chart-capture

```text
src/cli/index.ts
  -> loadConfig()
  -> runCapture(config, options)
    -> input/output/processed/failed 디렉터리 보장
    -> CSV 목록 수집/파싱
    -> findStocksMapByCodes()
    -> CaptureJob 생성(row x variant)
    -> Next 서버 시작 또는 external server 확인
    -> Playwright driver.capture(job)
    -> 성공/스킵/실패 집계
    -> CSV 이동과 sidecar log 생성
```

| 파일/폴더 | 역할 |
|-----------|------|
| `src/cli/index.ts` | CLI 옵션 파싱, config override, 종료 코드 |
| `capture.config.ts` | input/output, 포트, variant, concurrency 등 런타임 설정 |
| `src/pipeline/runCapture.ts` | 전체 캡처 파이프라인 |
| `src/pipeline/csvIO.ts` | CSV 파싱, 중복 제거, 파일 이동, sidecar log |
| `src/pipeline/nextServer.ts` | Next 서버 spawn 또는 외부 서버 health check |
| `src/pipeline/playwrightDriver.ts` | 브라우저 이동, ready 대기, screenshot |
| `src/app/capture/[stockCode]/[tradeDate]/[variant]` | 실제 캡처 화면 |
| `src/data/fetchChartData.ts` | 일봉/분봉 DB 조회 |
| `src/components/chart` | 캡처용 일봉/분봉 차트 |

## 9. 유지보수 판단 기준

새 기능을 넣을 때는 먼저 “어떤 책임인가”를 정하면 위치가 대체로 결정됩니다.

| 만들 기능 | 넣을 위치 |
|-----------|-----------|
| DB 테이블/컬럼 추가 | `packages/data-core/src/schema` |
| DB 저장/조회 API 추가 | `packages/data-core/src/repositories` |
| chart-review 화면 하나가 필요한 묶음 조회 | `packages/data-core/src/queries` 또는 `apps/chart-review/src/lib/chart` |
| 새 분봉 지표 | `packages/data-core/src/market-feature/calculators` + `MINUTE_CALCULATORS` |
| 키움 응답 row 변환 | `apps/batch/src/services/mappers` |
| 키움 응답 배열 조립 규칙 | `apps/batch/src/services/assemblers` |
| 복기 UI 전역 상태 | `apps/chart-review/src/stores` |
| 복기 UI 파생/순수 로직 | `apps/chart-review/src/lib` |
| 복기 화면 조작 단축키 | `apps/chart-review/src/lib/shortcuts.ts`, `src/hooks/useGlobalShortcuts.ts` |
| Google Sheet 직접 I/O | `apps/chart-review/src/actions/sheet.ts`, `src/lib/sheetsWriter.ts` |
| 캡처 CLI 동작 | `apps/chart-capture/src/pipeline` |

## 10. 자주 헷갈리는 경계

- `data-core/repositories`는 공용 DB 접근입니다. 앱 UI 상태나 Next request/cookie를 모르면 더 좋습니다.
- `chart-review/lib/loadReviewRows.ts`는 앱 작업셋을 만드는 glue code입니다. Sheet 설정, mock fallback, data-core 조회 결과를 UI row로 바꾸는 일을 합니다.
- `chart-review/lib/chart/loadChartPreview.ts`는 chart-review 전용 DTO 변환입니다. `data-core/getThemeBundle()`은 raw DB 묶음이고, 여기에서 차트가 먹기 좋은 `ChartPreviewDTO`로 바뀝니다.
- `feature-processor`는 계산기를 소유하지 않습니다. 계산기는 data-core에 등록되어 스키마 컬럼 생성과 계산 결과가 한 출처를 공유합니다.
- `chart-capture`는 `data-core` repository 일부를 쓰지만, 캡처 화면용 일봉/분봉 조회는 `src/data/fetchChartData.ts`에서 직접 schema를 import해 단순 조회합니다.
