# Trade Data Manager (Monorepo)

주식 데이터를 수집하고 분석하기 위한 데이터 관리 시스템입니다.

## 프로젝트 목표
- **데이터 수집 (Batch)**: 키움 API를 활용하여 KRX 및 NXT(대체거래소) 데이터를 수집하고 통합 관리합니다.
- **스키마 공유 (Database Package)**: 데이터베이스 스키마와 연결 객체를 독립된 패키지로 분리하여, 향후 추가될 프론트엔드(`Next.js`) 서비스와 손쉽게 연동될 수 있도록 합니다.
- **모노레포 구조 (pnpm + Turbo)**: 프로젝트 전반의 설정을 공유하고 빌드 성능을 최적화합니다.

## 핵심 구조 및 기술 스택
- **워크스페이스**: `pnpm workspace` & `turborepo`
- **배치 앱**: `apps/batch` (Node.js, tsx, winston)
- **데이터베이스 패키지**: `packages/database` (Drizzle ORM, PostgreSQL)
- **공통 설정 패키지**: `packages/tsconfig` (TypeScript)

## 빠른 시작 (Quick Start)

### 1. 의존성 설치
```bash
pnpm install
```

### 2. 환경 변수 설정
각 디렉토리의 `.env` 파일을 설정해야 합니다. (`.env.example` 참조)
- `apps/batch/.env`
- `packages/database/.env`

### 3. DB 스키마 적용
데이터베이스가 준비된 상태에서 스키마를 동기화합니다.
```bash
pnpm db:push
```

### 4. 배치 실행 (수집기)
```bash
# apps/batch 실행
pnpm --filter @trade-data-manager/batch dev
```

### 5. 테스트 실행
```bash
pnpm test
```

## 가이드 문서
더 자세한 내용은 [docs/MONOREPO_GUIDE.md](./docs/MONOREPO_GUIDE.md)를 참고해 주세요.
