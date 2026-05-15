# 📈 Kiwoom Trade Data Manager

키움 REST API로 주식 데이터를 수집·가공하여 **매매 전략 복기 및 분석을 위한 최적의 데이터셋(Trading Opportunity)** 을 구축하는 모노레포 시스템입니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [데이터 파이프라인](#4-데이터-파이프라인)
5. [빠른 시작](#5-빠른-시작)
6. [명령어 가이드](#6-명령어-가이드)
7. [상황별 시나리오](#7-상황별-시나리오)
8. [CSV 입력 포맷](#8-csv-입력-포맷)
9. [데이터베이스 스키마 개요](#9-데이터베이스-스키마-개요)

---

## 1. 프로젝트 개요

이 시스템은 크게 세 단계로 동작합니다.

- **수집(batch)**: 키움 API를 통해 종목 정보, 일봉, 분봉, 테마 매핑을 수집하고 PostgreSQL에 정규화하여 저장합니다.
- **가공(feature-processor)**: 저장된 분봉 데이터를 읽어 기술적 지표를 계산하고 피처 테이블에 저장합니다.
- **시각화/분석(data-view, chart-capture)**: 저장된 데이터를 웹 UI로 탐색하거나, 차트를 PNG로 일괄 캡처하여 분류 작업에 활용합니다.

---

## 2. 기술 스택

| 항목 | 상세 |
|------|------|
| Runtime | Node.js 22+ |
| Language | TypeScript (Strict mode) |
| Monorepo | pnpm Workspaces + Turborepo |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Web Framework | Next.js 14 (App Router) |
| HTTP Client | Axios |
| Chart | lightweight-charts |
| Capture | Playwright |
| Logging | Winston |

---

## 3. 프로젝트 구조

```
trade-data-manager/
├── apps/
│   ├── batch/                     # 수집 CLI
│   ├── feature-processor/         # 가공 CLI
│   ├── data-view/                 # 데이터 탐색 웹 (Next.js)
│   └── chart-capture/             # 차트 PNG 캡처 (Next.js + Playwright CLI)
└── packages/
    ├── data-core/                 # SSOT: DB 스키마, 레포지토리, 쿼리
    └── tsconfig/                  # 공통 TypeScript 설정
```

---

## 4. 데이터 파이프라인

```
[Step 1] apps/batch
  CSV(테마/종목) 읽기
    └─▶ 키움 API 호출 (종목 정보, 일봉, 분봉, 테마 매핑)
    └─▶ PostgreSQL UPSERT

[Step 2] apps/feature-processor
  저장된 분봉 읽기
    └─▶ 기술적 지표 계산 (변동률, 누적거래대금, 고점 등)
    └─▶ minute_candle_features 테이블 UPSERT

[Step 3-a] apps/data-view
  웹 UI로 데이터 탐색 (필터, 차트 모달)

[Step 3-b] apps/chart-capture
  CSV(종목/날짜) 입력 → KRX/NXT 차트 PNG 일괄 캡처
```

---

## 5. 빠른 시작

### 사전 요구사항

- Node.js 22+
- pnpm 10+
- PostgreSQL 14+
- 키움 OpenAPI 앱키/시크릿

### 설치

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정 (.env.example 참조)
cp .env.example .env

# 3. DB 스키마 적용
pnpm db:push

# 4. Playwright 브라우저 설치 (chart-capture 사용 시)
pnpm --filter @trade-data-manager/chart-capture exec playwright install chromium
```

### 환경 변수 (.env)

```env
# DB
DATABASE_URL=postgresql://user:password@localhost:5432/trade_db

# 키움 API (batch 전용)
KIWOOM_APP_KEY=your_app_key
KIWOOM_SECRET_KEY=your_secret_key
KIWOOM_BASE_URL=https://api.kiwoom.com

# 차트 캡처 (chart-capture 전용)
CAPTURE_INPUT_DIR=./capture-input
CAPTURE_OUTPUT_DIR=./capture-output
```

---

## 6. 명령어 가이드

### 6.1 명령어 컨벤션

모든 앱이 다음 6가지 표준 명령어를 따릅니다.

| 명령어 | 의미 | 비고 |
|--------|------|------|
| `dev` | 개발 모드 실행 | Next 앱은 HMR 서버, CLI 앱은 `tsx`로 즉시 실행 |
| `build` | 빌드 산출물 생성 | Next: `.next/`, CLI: `dist/` |
| `start` | 빌드 결과로 실행 | build 선행 필요 |
| `type-check` | 타입 검사 | `tsc --noEmit` |
| `clean` | 빌드 산출물 삭제 | `dist`, `.next` 등 |
| `clean:cache` | 캐시까지 삭제 | `+ .turbo`, `node_modules/.cache`, `tsbuildinfo` |
| `clean:all` | 의존성까지 삭제 | `+ node_modules` |

### 6.2 루트에서 실행 (Turborepo 일괄)

루트에서 명령어를 실행하면 **Turborepo가 모든 워크스페이스에 동일 명령어를 병렬 전파**합니다.

```bash
# 전체 앱 빌드 (의존성 그래프 따라 순서대로)
pnpm build

# 전체 앱 dev 모드
pnpm dev

# 전체 앱 타입 검사
pnpm type-check

# 빌드 캐시 정리 (3단계)
pnpm clean         # 빌드 산출물만 (dist, .next)
pnpm clean:cache   # + Turbo/TS 캐시
pnpm clean:all     # + node_modules 전부

# 자주 쓰는 매크로
pnpm rebuild       # clean + build
pnpm fresh         # clean:all + install + build (핵폭탄)

# DB 관련 (data-core로 위임됨)
pnpm db:generate   # 마이그레이션 파일 생성
pnpm db:push       # 스키마 즉시 반영 (개발용)
pnpm db:studio     # Drizzle Studio 실행
```

### 6.3 특정 앱만 실행 (filter)

루트에서 `--filter`로 특정 앱만 지정할 수 있습니다.

```bash
# 특정 앱 dev
pnpm --filter @trade-data-manager/data-view dev
pnpm --filter @trade-data-manager/batch dev

# 특정 앱 build + start
pnpm --filter @trade-data-manager/data-view build
pnpm --filter @trade-data-manager/data-view start

# 단축 표기 (앱 이름의 마지막 segment만)
pnpm --filter data-view dev
pnpm --filter chart-capture capture
```

### 6.4 앱 디렉토리로 이동 후 실행

해당 앱 폴더 안에서는 `pnpm <script>`만 입력해도 됩니다.

```bash
cd apps/data-view
pnpm dev          # 동일: pnpm --filter data-view dev (루트에서)
pnpm build
pnpm start
```

---

## 7. 상황별 시나리오

각 앱의 특성과 자주 쓰는 흐름을 정리했습니다.

### 7.1 batch — 데이터 수집 (CLI)

**언제 쓰나**: 매일 장 마감 후 신규 거래일 데이터를 적재할 때.

**`dev` vs `build+start`**: CLI라서 시작 오버헤드가 의미 없으므로 **`dev`로 충분**합니다. build는 굳이 안 해도 됩니다.

```bash
# csv/ 폴더에 YYYY-MM-DD.csv 파일을 넣어둔 뒤
pnpm --filter batch dev

# 또는 앱 폴더에서
cd apps/batch
pnpm dev
```

**프로덕션 운영 (cron 등)으로 안정성이 필요할 때만**:

```bash
pnpm --filter batch build
pnpm --filter batch start
```

---

### 7.2 feature-processor — 데이터 가공 (CLI)

**언제 쓰나**: batch로 수집한 거래일 데이터에 대해 기술적 지표를 계산할 때.

batch와 동일하게 `dev`로 충분합니다.

```bash
# 특정 거래일만 처리
pnpm --filter feature-processor dev minute -- --date 2026-04-21

# 아직 처리 안 된 거래일 일괄
pnpm --filter feature-processor dev minute -- --pending

# 전체 거래일 재처리
pnpm --filter feature-processor dev minute -- --all
```

---

### 7.3 data-view — 데이터 탐색 웹 (Next.js)

**언제 쓰나**: 수집·가공된 데이터를 필터·차트로 탐색할 때.

**중요**: Next.js 앱은 `dev`와 `start`가 체감 속도가 크게 다릅니다.

| 모드 | 첫 페이지 진입 | 코드 수정 반영 | 추천 상황 |
|------|--------------|--------------|---------|
| `dev` | 10~30초 (온디맨드 컴파일) | HMR로 즉시 | 코드 수정하며 작업 |
| `start` | 즉시 | 재빌드 필요 | 그냥 데이터 보기만 할 때 |

#### 일상 사용 (코드 수정 없이 데이터만 보기) — 추천

```bash
# 1회만 빌드
pnpm --filter data-view build

# 이후 매번
pnpm --filter data-view start
# → http://localhost:3000
```

#### UI 개발 중

```bash
pnpm --filter data-view dev
```

#### 코드 변경 후 다시 start로 돌아갈 때

```bash
pnpm --filter data-view build  # 다시 빌드
pnpm --filter data-view start
```

---

### 7.4 chart-capture — 차트 PNG 캡처 (Next.js + Playwright CLI)

**언제 쓰나**: 종목/날짜 목록을 차트 이미지로 일괄 변환할 때 (DigiKam 등 분류 작업용).

이 앱은 **표준 명령어 외에 `capture`라는 특수 진입점**이 추가로 있습니다.

#### 명령어 정리

| 명령어 | 동작 |
|--------|------|
| `pnpm --filter chart-capture build` | Next 앱 빌드 |
| `pnpm --filter chart-capture start` | Next 서버만 띄움 (port 3939). 브라우저로 차트 확인하거나 외부 서버 모드 디버깅용 |
| `pnpm --filter chart-capture capture` | **CLI가 자동으로 `next start`를 띄우고 Playwright로 PNG 캡처 → CSV 이동까지 전부 처리** |
| `pnpm --filter chart-capture capture:dev` | `next dev` 모드로 캡처 (코드 수정 디버깅용, 첫 페이지 20~30초 걸림) |

#### 일상 캡처 — 추천

```bash
# 1회만 빌드
pnpm --filter chart-capture build

# 이후 매번 (capture-input/*.csv가 있으면 자동으로 모두 처리)
pnpm --filter chart-capture capture
```

> `pnpm capture`는 내부에서 `next start`를 spawn하므로 **build 결과물이 반드시 필요**합니다.

#### 코드 수정하면서 디버깅

```bash
pnpm --filter chart-capture capture:dev
```

#### 차트를 브라우저로 미리 확인하고 싶을 때

```bash
# 터미널 A
pnpm --filter chart-capture start
# → http://localhost:3939/capture/005930/2026-04-21/KRX 등으로 접속

# 터미널 B (이미 띄운 서버에 캡처 붙이기)
pnpm --filter chart-capture capture --external-server http://localhost:3939
```

#### Dry-run (실제 캡처 없이 경로만 확인)

```bash
pnpm --filter chart-capture capture --dry-run
```

---

### 7.5 캐시 꼬임 / 빌드 오류 대처

증상별로 단계적으로 청소합니다. 가벼운 것부터 시도하세요.

#### 1단계: 빌드 산출물만 정리

```bash
pnpm clean
pnpm build
```

#### 2단계: Turbo/TS 캐시까지 정리

```bash
pnpm clean:cache
pnpm build
```

#### 3단계: 의존성까지 전부 재설치 (최후의 수단)

```bash
pnpm fresh
# 내부적으로: clean:all → install → build
```

#### 특정 앱만 청소

```bash
pnpm --filter data-view clean
pnpm --filter chart-capture clean:cache
```

---

### 7.6 데이터 파이프라인 전체 흐름 예시

신규 거래일(예: `2026-04-21`)을 처음부터 끝까지 처리하는 흐름:

```bash
# 1. 종목/테마 CSV를 apps/batch/csv/2026-04-21.csv로 저장

# 2. 수집
pnpm --filter batch dev

# 3. 가공
pnpm --filter feature-processor dev minute -- --date 2026-04-21

# 4-a. 웹에서 탐색
pnpm --filter data-view start    # 사전에 build 1회

# 4-b. 또는 차트 PNG 캡처
# capture-input/에 종목+날짜 CSV를 넣어두고
pnpm --filter chart-capture capture    # 사전에 build 1회
```

---

## 8. CSV 입력 포맷

### batch (`apps/batch/csv/YYYY-MM-DD.csv`)

파일명에서 거래일을 자동 추출합니다.

```csv
테마명,종목코드,종목명
2차전지,006400,삼성SDI
2차전지,096770,SK이노베이션
반도체,005930,삼성전자
```

- 테마명이 비어있으면 테마 매핑 없이 종목 정보/일봉/분봉만 수집
- 동일 종목이 여러 테마에 속할 경우 여러 행에 나눠 적음

### chart-capture (`capture-input/*.csv`)

```csv
stockCode,tradeDate,line_target,line_stop,line_entry
005930,2026-04-21,75000,72000,73500
000660,20260421,150000|145000,140000,
```

- `stockCode`: 6자리 (앞 0 보존)
- `tradeDate`: `YYYY-MM-DD` 또는 `YYYYMMDD`
- `line_*`: `|` 구분 가격 숫자 목록 (생략 가능)

---

## 9. 데이터베이스 스키마 개요

```
[정규화 테이블]
stocks                   ← 종목 마스터
themes                   ← 테마 마스터
daily_candles            ← 일봉 (KRX + NXT 통합)
minute_candles           ← 분봉 (등락률 비정규화 포함)
daily_theme_mappings     ← 종목-테마 매핑 (날짜 기준)
intraday_program_amounts ← 실시간 프로그램 매매 동향

[피처 테이블]
minute_candle_features   ← 분봉 기술적 지표
```

스키마 정의는 `packages/data-core/src/schema/` 참조.

---

## 부록: 명령어 빠른 참조표

| 상황 | 명령어 |
|------|--------|
| 처음 설치 후 한 번 | `pnpm install && pnpm db:push && pnpm build` |
| 일상: 데이터 수집 | `pnpm --filter batch dev` |
| 일상: 피처 가공 | `pnpm --filter feature-processor dev minute -- --pending` |
| 일상: 웹 탐색 | `pnpm --filter data-view start` |
| 일상: 차트 캡처 | `pnpm --filter chart-capture capture` |
| 코드 수정 후 다시 start | `pnpm --filter <app> build && pnpm --filter <app> start` |
| 빌드 오류 시 (가벼움) | `pnpm clean && pnpm build` |
| 빌드 오류 시 (중간) | `pnpm clean:cache && pnpm build` |
| 빌드 오류 시 (핵폭탄) | `pnpm fresh` |
| 특정 앱만 청소 | `pnpm --filter <app> clean` |

