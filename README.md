# 🚀 Trade Data Manager (TypeScript Batch Collector)

본 프로젝트는 **키움 REST API**와 **CSV 파일**을 기반으로 주식 종목 정보, 일봉 및 분봉 데이터를 수집하여 **PostgreSQL**에 정제 및 저장하는 독립형 TypeScript 배치 시스템입니다.

---

## 🛠 Tech Stack

- **Runtime**: Node.js (v18+)
- **Language**: TypeScript (Strict Mode)
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **HTTP Client**: Axios
- **Logging**: Winston

---

## 📂 프로젝트 구조 (Project Structure)

프로젝트는 관심사 분리(SoC) 원칙에 따라 설계되었습니다.

- **`src/clients/`**: 외부 API(Kiwoom) 통신 및 인증 로직
- **`src/db/`**: Drizzle 스키마 정의 및 DB 접근 계층 (Repository)
- **`src/services/`**
  - `normalizer.ts`: API 응답 데이터를 DB 포맷으로 가공하는 순수 함수
  - `collectorService.ts`: 수집 파이프라인 제어 (CSV 스캔 -> 수집 -> 저장)
- **`src/utils/`**: 로거 등 공통 유틸리티
- **`csv/`**: 수집 대상 CSV 파일이 위치하는 입력 폴더

---

## ⚙️ 환경 설정 (Prerequisites)

### 1. 환경 변수 (.env)
프로젝트 루트에 `.env` 파일을 생성하고 아래 항목을 설정해야 합니다.

```env
DATABASE_URL=postgresql://user:password@localhost:5432/trade_db
KIWOOM_APP_KEY=your_app_key
KIWOOM_SECRET_KEY=your_secret_key
KIWOOM_BASE_URL=https://openapi.kiwoom.com
```

### 2. 의존성 설치
```bash
npm install
```

---

## 🗄 데이터베이스 설정 (Database Setup)

Drizzle Kit을 사용하여 테이블 스키마를 생성하고 마이그레이션합니다.

```bash
# 마이그레이션 파일 생성
npx drizzle-kit generate

# DB에 스키마 적용
npx drizzle-kit push
```

---

## 🏃 수집 가이드 (Usage)

### 1. CSV 데이터 준비
`csv/` 폴더 내에 수집할 날짜 형식의 파일을 준비합니다 (예: `2026-04-20.csv`).
- **파일 포맷**: `메모,종목코드,종목명` 형식을 기대하며, 첫 번째 열(`메모`)은 테마 정보로 활용됩니다.

### 2. 배치 실행
`tsx`를 통해 배치를 가동합니다.
```bash
npx tsx src/index.ts
```

### 3. 파일 처리 흐름 (In/Out 전략)
- **성공**: `csv/processed/` 폴더로 이동 (이미 있으면 덮어쓰기)
- **실패**: `csv/failed/` 폴더로 이동 (실패 사유 로그 기록)

---

## ✨ 핵심 기능 상세 (Key Features)

| 기능 | 상세 설명 | 관련 파일 |
| :--- | :--- | :--- |
| **토큰 캐싱** | API 토큰을 `.cache/`에 저장하여 유효 시간 내 재사용 | `kiwoomClient.ts` |
| **호출 제한 방어** | 1초 4건 제한을 준수하기 위해 요청 간 250ms 지연 강제 | `kiwoomClient.ts` |
| **Bulk Upsert** | 데이터 중복 시 기존 데이터를 갱신(`onConflictDoUpdate`)하여 무결성 유지 | `marketRepository.ts` |
| **하이브리드 로깅** | 콘솔에는 색상 적용, 파일에는 분석용 JSON 포맷으로 기록 | `logger.ts` |
| **데이터 통합** | KRX와 NXT(Nextrade) 데이터를 병렬 수집하여 단일 Row에 통합 저장 | `collectorService.ts` |

---

## 🧪 테스트 (Testing)

기능별 통합 테스트 스크립트를 제공합니다.

```bash
# 키움 API 연동 테스트 (토큰, Rate Limit, 연속조회)
npx tsx src/test/kiwoomClient.test.ts

# KRX vs NXT 데이터 비교 테스트
npx tsx src/test/compare_pred_pre.test.ts
```
