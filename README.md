# 📈 Kiwoom Trade Data Manager

키움 REST API로 주식 데이터를 수집·가공하여 **매매 전략 복기 및 분석을 위한 최적의 데이터셋(Trading Opportunity)** 을 구축하는 독립형 CLI 배치 시스템입니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [데이터 파이프라인](#4-데이터-파이프라인)
5. [빠른 시작 (Quick Start)](#5-빠른-시작-quick-start)
6. [패키지별 실행 가이드](#6-패키지별-실행-가이드)
7. [CSV 입력 포맷](#7-csv-입력-포맷)
8. [데이터베이스 스키마 개요](#8-데이터베이스-스키마-개요)

---

## 1. 프로젝트 개요

이 시스템은 크게 두 단계로 동작합니다.

- **수집(Batch)**: 키움 API를 통해 종목 정보, 일봉, 분봉, 테마 매핑을 수집하고 PostgreSQL에 정규화하여 저장합니다.
- **가공(Processor)**: 저장된 분봉 데이터를 읽어 기술적 지표, 테마 통계, 순위를 계산하고, 사람이 직접 마킹한 '맥점(CSV)'을 기반으로 분석 마스터 테이블(`trading_opportunities`)을 생성합니다.

---

## 2. 기술 스택

| 항목 | 상세 |
|------|------|
| Runtime | Node.js (`tsx`로 TypeScript 직접 실행) |
| Language | TypeScript (Strict mode) |
| Monorepo | pnpm Workspaces + TurboRepo |
| Database | PostgreSQL |
| ORM | Drizzle ORM (Type-safe schema & Bulk Upsert) |
| HTTP Client | Axios |
| Logging | Winston |
| Date Handling | Day.js |
| Utilities | Lodash |

---

## 3. 프로젝트 구조

```
trade-data-manager/
│
├── apps/
│   ├── batch/                    # 수집기 (Collector)
│   │   ├── csv/                  # 수집 대상 CSV 입력 폴더
│   │   │   ├── processed/        # 처리 완료 파일 보관
│   │   │   └── failed/           # 처리 실패 파일 보관
│   │   └── src/
│   │       ├── clients/          # Kiwoom API 클라이언트
│   │       ├── services/         # CollectorService, normalizer
│   │       └── db/               # marketRepository (raw data 저장)
│   │
│   └── processor/                # 가공기 (Transformer)
│       ├── csv_opportunity/      # Opportunity 분석 대상 CSV 입력 폴더
│       └── src/
│           ├── services/
│           │   ├── minuteFeatureService.ts   # 분봉 기술적 지표 계산
│           │   ├── ThemeContextService.ts    # 테마 통계 & 순위 계산
│           │   └── opportunityService.ts     # 최종 마스터 레코드 생성
│           ├── db/               # processorRepository (피처 조회/저장)
│           ├── index.ts          # 진입점: Step 1~2 (피처 + 테마 통계)
│           └── opportunity.ts    # 진입점: Step 3 (Opportunity 생성)
│
└── packages/
    ├── database/                 # SSOT: 스키마, DB 연결, 공통 상수
    │   └── src/
    │       ├── schema/
    │       │   ├── market.ts     # stocks, daily/minuteCandles, themes, 프로그램매매
    │       │   └── features.ts   # minuteCandleFeatures, themeFeatures, tradingOpportunities
    │       ├── constants.ts      # STAT_RATES, STAT_AMOUNTS
    │       └── index.ts          # db 연결 객체 & 전체 re-export
    └── tsconfig/                 # 공통 TypeScript 설정
```

---

## 4. 데이터 파이프라인

전체 파이프라인은 **3개의 독립 실행 단계**로 구성됩니다.

```
[Step 1] apps/batch
  CSV (날짜/종목/테마) 읽기
    └─▶ 종목 정보 수집 (saveStock)
    └─▶ 일봉 수집 - KRX + NXT 병렬 조회 (saveDailyCandles)
    └─▶ 분봉 수집 - 당일 분봉만 필터 (saveMinuteCandles)
    └─▶ 테마 매핑 저장 (saveThemeMapping)

[Step 2] apps/processor  ← index.ts 실행
  저장된 분봉 읽기 (tradeDate 인자 필수)
    └─▶ [Phase 1] 종목별 기술적 지표 계산
    │     ├── 누적 거래대금 (cumulativeTradingAmount)
    │     ├── N분 전 대비 변동률 (changeRate5m ~ 120m)
    │     ├── 당일 고점 등락률 & 발생 시간 (dayHighRate, dayHighTime)
    │     ├── 고점 대비 눌림목 (pullbackFromDayHigh)
    │     └── 거래대금 구간별 돌파 횟수 (cnt20Amt ~ cnt300Amt)
    │         → minute_candle_features 테이블에 Bulk Upsert
    │
    └─▶ [Phase 2] 테마 내 종목 간 역학 관계 계산
          ├── 테마 평균 등락률 (avgRate)
          ├── 등락률 구간별 종목 수 (cnt3RateStockNum ~ cnt28RateStockNum)
          ├── 거래대금 구간별 종목 수 (cnt20AmtStockNum ~ cnt300AmtStockNum)
          └── 종목별 테마 내 순위 (rankByRateKrx/Nxt, rankByCumulativeTradingAmount)
              → theme_features, theme_stock_contexts 테이블에 저장

[Step 3] apps/processor  ← opportunity.ts 실행  (별도 수동 실행)
  csv_opportunity/*.csv 읽기 (날짜 + 시간 + 종목코드)
    └─▶ 해당 시점의 분봉 피처 + 테마 통계 + 순위 조회
    └─▶ 테마 내 상위 6개 종목(슬롯 S1~S6) 데이터 조회
    └─▶ 모든 데이터를 단일 레코드로 비정규화
        → trading_opportunities 테이블에 저장
```

---

## 5. 빠른 시작 (Quick Start)

### 사전 요구사항

- Node.js 20+
- pnpm 10+
- PostgreSQL 14+
- 키움 OpenAPI REST 접근 키 (앱키 + 시크릿키)

### 설치

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정
# .env.example 참조하여 각 패키지에 .env 파일 생성
cp .env.example apps/batch/.env
cp .env.example packages/database/.env
# apps/processor/.env 도 동일하게 DATABASE_URL 설정 필요

# 3. DB 스키마 적용
pnpm db:push
```

### 환경 변수 (.env)

```env
# 키움 API 인증 (apps/batch/.env)
KIWOOM_APP_KEY=your_app_key
KIWOOM_SECRET_KEY=your_secret_key
KIWOOM_BASE_URL=https://openapi.koreainvestment.com:9443

# DB 연결 (packages/database/.env, apps/processor/.env)
DATABASE_URL=postgresql://user:password@localhost:5432/trade_db

# 선택
REQUEST_TIMEOUT_SECONDS=30
TOKEN_CACHE_HOURS=24
```

---

## 6. 패키지별 실행 가이드

### Step 1: 데이터 수집 (Batch)

`apps/batch/csv/` 폴더에 `YYYY-MM-DD.csv` 형식의 파일을 넣고 실행합니다.

```bash
# 개발 모드 실행
pnpm --filter @trade-data-manager/batch dev

# 또는 turbo로 실행
pnpm dev --filter @trade-data-manager/batch
```

### Step 2: 피처 & 테마 통계 가공 (Processor)

```bash
# 날짜를 YYYYMMDD 형식 인자로 반드시 전달
pnpm --filter @trade-data-manager/processor dev:process -- 20260420
```

> ⚠️ Step 1(수집)이 완료된 날짜에 대해서만 실행할 수 있습니다.

### Step 3: Trading Opportunity 생성 (Processor)

`apps/processor/csv_opportunity/` 폴더에 Opportunity CSV 파일을 넣고 실행합니다.

```bash
pnpm --filter @trade-data-manager/processor dev:opportunity
```

> ⚠️ 해당 날짜의 Step 2가 완료된 후에만 실행할 수 있습니다.

### DB 관리

```bash
# 스키마를 DB에 즉시 반영 (개발용)
pnpm db:push

# 마이그레이션 파일 생성 (운영 배포용)
pnpm db:generate

# Drizzle Studio (DB 시각화 UI)
pnpm db:studio
```

---

## 7. CSV 입력 포맷

### Batch CSV (`apps/batch/csv/YYYY-MM-DD.csv`)

파일명에서 수집 날짜를 자동 추출합니다.

```csv
테마명,종목코드,종목명
2차전지,006400,삼성SDI
2차전지,096770,SK이노베이션
반도체,005930,삼성전자
```

> - `테마명`이 비어있으면 테마 매핑 없이 종목 정보/일봉/분봉만 수집합니다.
> - 동일 종목이 여러 테마에 속할 경우 여러 행에 나눠 적습니다.

### Opportunity CSV (`apps/processor/csv_opportunity/*.csv`)

```csv
날짜,시간,종목코드,종목명
20260420,091500,041190,우리기술투자
20260420,103000,005930,삼성전자
```

> - 날짜: `YYYYMMDD` 또는 `YYYY-MM-DD` 모두 허용
> - 시간: `HHMMSS` 또는 `HH:MM:SS` 모두 허용, 4자리(`HHMM`) 입력 시 `00`초 자동 보완

---

## 8. 데이터베이스 스키마 개요

```
[정규화 테이블]
stocks               ← 종목 마스터
themes               ← 테마 마스터
daily_candles        ← 일봉 (KRX + NXT 통합)
minute_candles       ← 분봉 (등락률 비정규화 포함)
daily_theme_mappings ← 종목-테마 매핑 (날짜 기준)
intraday_program_amounts ← 실시간 프로그램 매매 동향

[피처 테이블]
minute_candle_features   ← 분봉 기술적 지표 (종목별 Fact)
theme_features           ← 테마 집계 지표 (테마별 Fact)
theme_stock_contexts     ← 테마 내 종목 순위 (Relation Fact)

[최종 마스터]
trading_opportunities    ← 모든 데이터 비정규화 (분석용)
                            ├── 포착 종목 피처 전량
                            ├── 테마 통계 전량
                            └── 상위 6개 슬롯(S1~S6) 데이터
```

> `STAT_RATES`(등락률 구간)와 `STAT_AMOUNTS`(거래대금 구간) 상수는 `packages/database/src/constants.ts`에서 관리되며, 스키마 컬럼 생성과 런타임 계산 모두에 동일하게 사용됩니다 (SSOT).
