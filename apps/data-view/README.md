# data-view

키움 API로 수집된 분봉/일봉 데이터를 차트로 조회하는 뷰어.

## 스크립트

| 명령어 | 동작 | URL |
|--------|------|-----|
| `pnpm dev` | HMR 개발 서버 | http://localhost:3100 |
| `pnpm build` | 프로덕션 빌드 | — |
| `pnpm start` | 빌드 결과 실행 | http://localhost:3100 |

루트에서 실행할 경우:

```bash
pnpm --filter data-view dev
pnpm --filter data-view build
pnpm --filter data-view start
```

## 환경 변수

루트 `.env` 파일에 설정합니다 (Next.js 앱이 `next.config.mjs`를 통해 자동 로드):

```
DATABASE_URL=postgresql://...   # PostgreSQL 연결 문자열
```

## 페이지

| 경로 | 설명 |
|------|------|
| `/stock-chart` | 종목 코드 + 날짜로 차트 조회 |
| `/chart/[stockCode]/[tradeDate]/[tradeTime]` | URL 직접 접근 차트 페이지 |

## 프로젝트 구조

| 폴더 | 설명 |
|------|------|
| `src/app/` | Next.js App Router 페이지 |
| `src/components/chart/` | lightweight-charts 기반 차트 컴포넌트 |
| `src/lib/chart/` | 차트 데이터 변환, 오버레이, 가격선 유틸 |
| `src/hooks/` | 차트 데이터 조회 훅 |
| `src/stores/` | Zustand 스토어 (UI, 차트 모달) |
| `src/actions/` | Next.js Server Actions |
| `src/providers/` | React Query Provider |

## 변경 작업 가이드

| 시나리오 | 가이드 |
|----------|--------|
| 구조·설계 이유를 알고 싶을 때 | [docs/README.md](docs/README.md) |
| 차트 지표(이동평균·기준선 등) 추가 | [docs/adding-chart-indicator.md](docs/adding-chart-indicator.md) |
