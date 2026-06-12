# data-core

모든 앱이 공유하는 SSOT(Single Source of Truth) 패키지. Drizzle ORM 스키마, 레포지토리, 쿼리, 피처 계산기를 제공합니다.

---

## 문서

| 문서 | 내용 |
|------|------|
| [docs/api-reference.md](./docs/api-reference.md) | 함수/쿼리/계산기별 입력·출력·DB 효과 예시 |
| 루트 [docs/project-code-map.md](../../docs/project-code-map.md) | 프로젝트 전체 흐름과 앱별 코드 위치 |

---

## 스크립트

| 명령어 | 동작 |
|--------|------|
| `pnpm db:generate` | 마이그레이션 파일 생성 (`drizzle/` 디렉터리) |
| `pnpm db:push` | 스키마를 DB에 즉시 반영 (개발용, 마이그레이션 파일 없이) |
| `pnpm db:migrate` | 마이그레이션 파일 기반 적용 |
| `pnpm db:studio` | Drizzle Studio 웹 UI 실행 |
| `pnpm db:check` | 마이그레이션 파일 무결성 검사 |
| `pnpm type-check` | 타입 검사 (`tsc --noEmit`) |
| `pnpm clean` | 빌드 산출물 삭제 |

루트에서는 `pnpm db:push` 등으로 바로 실행할 수 있습니다 (Turborepo가 data-core로 위임).

---

## 환경 변수

```
DATABASE_URL=postgresql://user:password@localhost:5432/trade-data-manager
```

---

## 패키지 구조

```
src/
├── index.ts              # 공개 API 진입점
├── db.ts                 # createDb() — drizzle 인스턴스 팩토리
├── schema/
│   ├── market.ts         # stocks, themes, daily_candles, minute_candles,
│   │                     # daily_theme_mappings, intraday_program_amounts
│   └── features.ts       # minute_candle_features (MINUTE_CALCULATORS 자동 생성)
├── repositories/         # 쓰기 함수 (UPSERT 중심)
├── queries/              # 읽기 함수 (앱이 호출하는 얇은 read API)
└── market-feature/
    ├── calculators/      # MINUTE_CALCULATORS 배열 (분봉 지표 계산기)
    └── helpers/          # 계산기 결과 병합 유틸
```

응집 기준:

- `schema/`: DB 구조만 정의한다. 앱 런타임, HTTP, 파일 I/O를 모른다.
- `repositories/`: DB read/write 단위 함수다. 대부분 앱에서 직접 호출해도 되는 공용 API다.
- `queries/`: 여러 repository를 묶어 화면이 먹기 좋은 큰 응답을 만든다. 현재는 chart-review 차트용 `getThemeBundle()`이 대표적이다.
- `market-feature/`: 분봉 피처 컬럼 정의와 계산 로직의 단일 출처다. 계산기 추가 시 schema와 runner 결과가 같이 바뀐다. 피처 투영 목록 `FEATURE_COLUMNS`도 여기 있다(read/export 공통).

> Sheet(CSV/Google Sheet) 표현 변환은 data-core 가 담당하지 않는다. data-core 는 `findReviewExportRows()`로 DB 행(`ReviewExportRow[]`)까지만 제공하고, 시트 매트릭스 생성(`buildSheetMatrix`)·헤더/`m_` 접두·`" | "` 결합은 앱(chart-review)의 Sheet 계층이 담당한다.

### 익스포트 진입점

| 익스포트 | 내용 |
|----------|------|
| `@trade-data-manager/data-core` | `createDb`, 스키마, 레포지토리, 쿼리, 피처 계산기 전체 |
| `@trade-data-manager/data-core/schema` | 스키마 타입만 분리해서 임포트 |

---

## 데이터베이스 스키마

### 마켓 테이블 (`schema/market.ts`)

| 테이블 | 역할 | 유니크 키 |
|--------|------|-----------|
| `stocks` | 종목 마스터 | `stockCode` |
| `themes` | 테마 마스터 | `themeName` |
| `daily_candles` | 일봉 (KRX + NXT 통합) | `(tradeDate, stockCode)` |
| `minute_candles` | 1분봉 | `(stockCode, tradeDate, tradeTime)` |
| `daily_theme_mappings` | 종목-테마 매핑 (날짜 기준) | `(themeId, dailyCandleId)` |
| `intraday_program_amounts` | 프로그램 매매 동향 | `(dailyCandleId, tradeTime)` |

### 피처 테이블 (`schema/features.ts`)

| 테이블 | 역할 | 유니크 키 |
|--------|------|-----------|
| `minute_candle_features` | 분봉 기술적 지표 | `minuteCandleId` |

`minute_candle_features`의 컬럼은 `MINUTE_CALCULATORS` 배열에서 동적으로 생성됩니다. 새 지표를 추가하면 스키마에 자동 반영됩니다.

---

## 대표 호출 흐름

### batch 수집

```text
apps/batch MarketService
  -> saveStock()
  -> saveDailyCandles()
  -> findDailyCandleByStockAndDate()
  -> saveMinuteCandles()
  -> saveThemeAndReturnId()
  -> saveThemeMapping()
```

### feature-processor 가공

```text
apps/feature-processor runner
  -> findDistinctStockCodesByDate()
  -> findMinuteCandlesByStockAndDate()
  -> MINUTE_CALCULATORS.calculate()
  -> mergeCalculatorOutputs()
  -> saveMinuteFeatures()
```

### chart-review 로딩

```text
apps/chart-review
  -> findReviewLoadTargets()        # 작업셋/Point List
  -> getThemeBundle()               # 차트 preview/테마 멤버
  -> upsertReviewPoint()            # 타점 저장
  -> mergeReviewPointPayloads()     # Sheet import merge
  -> findReviewExportRows()         # Sheet export 원천 행(matrix 변환은 앱이 담당)
```
