# Trade Data Manager

키움증권 OpenAPI 기반 한국 주식 시장 데이터 수집·정제·저장 파이프라인.

CSV로 정의된 종목·테마 리스트를 입력받아 일봉/분봉/테마매핑 데이터를 PostgreSQL에 적재하며, 후속 단계의 기술적 지표 계산(`features`)과 매매 기회 탐색(`opportunities`)을 위한 기반 데이터를 구축한다.

---

## 📐 아키텍처 개요

\```
┌─────────────────────┐
│  CSV (입력)          │  YYYY-MM-DD.csv: theme, stockCode, stockName
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  CsvBatchService    │  폴더 순회 / 파일 라이프사이클 관리
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  CsvParserService   │  CSV → Map<stockCode, GroupedTarget>
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐      ┌─────────────────────┐
│  MarketService      │ ◄──► │  KiwoomClient       │  Rate Limit + Token 관리
│   ├ syncStockInfo   │      └─────────────────────┘
│   ├ syncDailyCandles│
│   ├ syncMinuteCandles│
│   └ syncThemeMapping│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Assembler + Mapper │  배열 단위 도메인 규칙 + row 단위 변환
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  marketRepository   │  Drizzle ORM (UPSERT)
└──────────┬──────────┘
           │
           ▼
       PostgreSQL
\```

### 레이어 책임

| 레이어 | 책임 | 부수효과 |
|---|---|---|
| **CLI** (`index.ts`) | 인자 파싱, 모드 분기, 종료 코드 | I/O |
| **CsvBatchService** | 폴더 순회, 파일 이동(processed/failed) | 파일시스템 |
| **CsvParserService** | CSV 파싱, 종목 단위 그룹핑 | 파일 읽기만 |
| **MarketService** | 종목/일봉/분봉/테마 동기화 오케스트레이션 | API + DB |
| **KiwoomClient** | 키움 API 호출, Rate Limit, 페이지네이션, 토큰 관리 | API |
| **Assembler** | 배열 단위 도메인 규칙 (정렬, 전일종가, 누적합) | 없음 (순수) |
| **Mapper** | row 1개 단위 변환 (Kiwoom → DB Insert) | 없음 (순수) |
| **Repository** | DB 접근 (Drizzle UPSERT) | DB |

---

## 🗂️ 프로젝트 구조

\```
src/
├── index.ts                          # CLI 엔트리 포인트
├── clients/
│   ├── kiwoomClient.ts               # 키움 API 클라이언트 (싱글턴)
│   ├── config.ts                     # API 설정
│   ├── tokenManager.ts               # OAuth 토큰 관리
│   ├── decorators.ts                 # @KiwoomRequest 데코레이터
│   └── types.ts                      # API 응답 타입
├── db/
│   └── marketRepository.ts           # Drizzle 기반 UPSERT 함수
├── services/
│   ├── marketService.ts              # 시장 데이터 동기화 (싱글턴)
│   ├── decorators.ts                 # @ServiceOperation 데코레이터
│   ├── types.ts                      # 서비스 공용 타입
│   ├── assemblers/
│   │   └── candleAssembler.ts        # assembleDaily/MinuteCandles
│   ├── mappers/
│   │   ├── marketDataMapper.ts       # toStock/Daily/MinuteCandleInsert
│   │   └── utils/
│   │       ├── dateTimeParser.ts
│   │       ├── kiwoomNumberParser.ts
│   │       └── priceCalculator.ts
│   └── csv/
│       ├── csvBatchService.ts        # 폴더 순회 + 파일 라이프사이클
│       └── csvParserService.ts       # CSV 파싱 + 그룹핑
├── utils/
│   └── logger.ts
└── test/

csv/                                  # 입력 CSV (런타임 생성)
├── processed/                        # 처리 완료 보관
└── failed/                           # 처리 실패 보관

packages/data-core/                   # Drizzle 스키마 + 레포지토리 (워크스페이스 패키지)
└── src/schema/
    ├── market.ts                     # stocks, daily_candles, minute_candles 등
    └── features.ts                   # minute_candle_features
\```

---

## 🚀 빠른 시작

### 1. 사전 요구사항

- Node.js 22+
- pnpm 10+
- PostgreSQL 14+
- 키움증권 OpenAPI 신청 및 앱키/시크릿 발급

### 2. 설치

\```bash
pnpm install
\```

### 3. 환경변수 설정

루트 `.env` 파일을 생성합니다 (`.env.example` 참조):

```bash
# 키움 OpenAPI
KIWOOM_APP_KEY=your_app_key
KIWOOM_SECRET_KEY=your_secret_key
KIWOOM_BASE_URL=https://api.kiwoom.com

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/trade-data-manager

# CSV 입력 폴더 (기본: ./csv)
CSV_FOLDER=/path/to/batch-csv-input
```

### 4. DB 스키마 적용

루트에서 실행합니다:

```bash
pnpm db:push
```

### 5. CSV 준비

CSV 파일을 `CSV_FOLDER`(기본: `./csv`) 경로에 준비합니다.

파일명 규칙: `YYYY-MM-DD.csv`, 컬럼: `테마명,종목코드,종목명` (헤더 1행 포함)

CSV 예시 (`csv/2026-04-30.csv`):

```csv
테마명,종목코드,종목명
AI반도체,000660,SK하이닉스
AI반도체,005930,삼성전자
2차전지,006400,삼성SDI
```

### 6. 실행

```bash
# 개발 (tsx로 즉시 실행 — CLI 특성상 dev로 충분)
pnpm dev
# 또는 루트에서: pnpm --filter batch dev

# 프로덕션 (cron 등 안정적 운영 필요 시)
pnpm build
pnpm start
```

`CSV_FOLDER` 안의 모든 `.csv` 파일을 파일명 오름차순으로 처리한다.

---

## 📥 CSV 입력 규격

### 파일명

`YYYY-MM-DD.csv` 형식 필수. 다른 형식이면 `failed/`로 이동된다.

### 컬럼 (위치 기반)

| 인덱스 | 의미 | 비고 |
|---|---|---|
| 0 | 테마명 | 빈 값 가능 (해당 종목의 테마 매핑 스킵) |
| 1 | 종목코드 | 6자리, 예: `005930` |
| 2 | 종목명 | 표시용 |

- 1행은 헤더로 간주하여 스킵
- 각 셀의 앞쪽 작은따옴표(`'`)와 공백은 자동 제거 (Excel 문자열 보호용 접두어 대응)
- 동일 종목이 여러 테마에 걸쳐 등장하면 테마는 `Set`으로 합쳐짐

---

## 🔄 처리 플로우

### 폴더 배치 모드 (`processFolder`)

1. `csv/`, `csv/processed/`, `csv/failed/` 디렉터리 보장
2. `csv/` 직속 `.csv` 파일을 파일명(=날짜) 오름차순으로 수집
3. 각 파일에 대해:
   - `processFile` 호출
   - 성공 → `processed/`로 이동
   - 실패 → `failed/`로 이동 + 에러 로깅

### 파일 처리 (`processFile`)

1. 파일명에서 거래일 추출 (`YYYY-MM-DD`)
2. CSV 파싱 → `Map<stockCode, { stockName, themes }>`
3. 종목 단위로 순차 처리 (best-effort: 종목 하나 실패해도 다음 종목으로):
   - `syncStockInfo` — 종목 마스터 upsert
   - `syncDailyCandles` — KRX/NXT 일봉 600개 (`apiDate` 기준 과거)
   - `syncMinuteCandles` — 해당 거래일 1분봉 전체
   - 테마별 `syncThemeMapping` 반복

### 일봉 동기화 (`syncDailyCandles`)

- KRX 코드(`005930`)와 NXT 통합 코드(`005930_AL`)를 병렬 조회
- 두 배열을 `assembleDailyCandles`로 결합:
  - 일반 캔들: 전일 종가 = `i+1`번째 캔들의 종가
  - 가장 오래된 캔들이 상장일과 일치하면 전일 종가 `null`로 포함
  - 그 외(가장 오래된 캔들이 상장일이 아닌데 더 이전 데이터 없음): 전일 종가 알 수 없으므로 제외

### 분봉 동기화 (`syncMinuteCandles`)

- 부모 일봉(FK + prevClose) 사전 조회. 일봉 없으면 스킵
- NXT 통합 코드(`_AL`)로 분봉 수집, 가장 오래된 row가 거래일 이전이면 페이지네이션 종료
- `assembleMinuteCandles`로 필터/정렬/누적거래대금 계산 후 upsert

---

## 🗄️ 데이터 모델

### 핵심 테이블 (`packages/data-core/src/schema/market.ts`)

| 테이블 | 역할 | 유니크 키 |
|---|---|---|
| `stocks` | 종목 마스터 | `stockCode` |
| `themes` | 테마 마스터 | `themeName` |
| `daily_candles` | 일봉 (KRX+NXT 통합 1행) | `(tradeDate, stockCode)` |
| `minute_candles` | 1분봉 | `(stockCode, tradeDate, tradeTime)` |
| `daily_theme_mappings` | 일봉-테마 매핑 | `(themeId, dailyCandleId)` |
| `intraday_program_amounts` | 프로그램 매매 동향 | `(dailyCandleId, tradeTime)` |

### 피처 테이블 (`packages/data-core/src/schema/features.ts` — feature-processor가 채움)

- `minute_candle_features` — 분봉 기술적 지표 (변화율, 일중 고점 등)

---

## ⚙️ 키 메커니즘

### Rate Limit (`KiwoomClient.waitForRateLimit`)

요청 간 최소 간격을 보장한다. 동시 호출이 들어와도 `lastRequestTime`을 미리 갱신해 직렬화된 슬롯을 예약하므로 폭주가 발생하지 않는다.

### UPSERT (`buildConflictUpdateSet`)

`marketRepository`의 모든 저장 함수는 `ON CONFLICT DO UPDATE`를 사용한다. PK/유니크 키를 제외한 모든 컬럼을 `EXCLUDED.<col>`로 자동 갱신하며, `updatedAt`은 `NOW()`로 자동 처리된다. 제네릭으로 `excludeKeys`가 컴파일 타임에 검증되므로 컬럼 오타나 스키마 변경 시 즉시 타입 에러가 발생한다.

### 페이지네이션

- **일봉** (`getDailyChartsByCount`): 목표 개수에 도달할 때까지 `cont-yn`/`next-key`로 연속 조회
- **분봉** (`getMinuteChartsForDate`): 가장 오래된 row가 대상 거래일 이전이 되면 조기 종료, 안전장치로 최대 5페이지 제한

### 데코레이터

- `@KiwoomRequest(apiId)` — 키움 호출 로깅/에러 핸들링
- `@ServiceOperation(domain)` — 서비스 작업 로깅/메트릭

---

## 🛠️ 운영 가이드

### 실패한 파일 재처리

`CSV_FOLDER/failed/` 안의 파일을 `CSV_FOLDER/`로 다시 옮기고 실행하면 된다. UPSERT 기반이므로 멱등성이 보장된다.

```bash
# Linux/Mac
mv csv/failed/2026-04-30.csv csv/

# Windows (PowerShell)
Move-Item csv/failed/2026-04-30.csv csv/

pnpm dev
```

### 특정 종목만 재수집

`csv/`에 해당 종목만 담은 임시 CSV를 넣고 실행하면 된다.
또는 `tsx`로 직접 서비스 함수를 호출:

\```bash
pnpm exec tsx -e "
import { marketService } from './src/services/marketService.js';
await marketService.syncStockInfo('005930');
await marketService.syncDailyCandles('005930', '20260430');
await marketService.syncMinuteCandles('005930', '2026-04-30');
"
\```

### 로그 레벨 조정

`apps/batch/src/utils/logger.ts`에서 Winston 로그 레벨을 직접 수정한다.

---

## 📝 설계 원칙

1. **순수 함수 우선** — Mapper/Assembler는 외부 I/O 없이 입력→출력만으로 동작
2. **클래스는 상태/데코레이터가 있을 때만** — 그 외는 함수 모듈
3. **싱글턴 인스턴스** — `kiwoomClient`, `marketService`, `csvBatchService` 등 stateful한 컴포넌트
4. **타입 안전성** — Drizzle의 `$inferInsert`로 스키마-타입 동기화, schema drift에 강함
5. **멱등성** — 모든 저장은 UPSERT, 재실행해도 안전
6. **Best-effort 처리** — 종목 단위 실패는 격리되어 다른 종목 처리에 영향 없음

---

## 📄 라이선스

Private project.
