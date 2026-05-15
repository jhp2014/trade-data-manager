# data-view

거래 데이터(CSV 덱) 분석·시각화 도구. 테마 스냅샷 DB와 연동하여 종목별 등락률·거래대금·차트를 조회합니다.

## 실행

| 명령어 | 동작 | URL |
|--------|------|-----|
| `pnpm dev` | HMR 개발 서버 (코드 수정 시 사용) | http://localhost:3100 |
| `pnpm build` | 프로덕션 빌드 (`.next/` 생성) | — |
| `pnpm start` | 빌드 결과로 서버 기동 (데이터 탐색 시 추천) | http://localhost:3100 |

루트에서 실행할 경우:

```bash
pnpm --filter data-view dev
pnpm --filter data-view build
pnpm --filter data-view start
```

### 환경 변수

루트 `.env` 파일에 설정합니다 (Next.js 앱이 `next.config.mjs`를 통해 자동 로드):

```
DATABASE_URL=postgresql://...   # PostgreSQL 연결 문자열
DECKS_DIR=/path/to/decks        # CSV 덱 파일 루트 디렉터리
```

## 디렉터리 구조

| 경로 | 역할 |
|------|------|
| `src/app/` | Next.js App Router 라우팅 및 페이지 진입점 |
| `src/components/chart/` | lightweight-charts 기반 캔들·오버레이 차트 컴포넌트 |
| `src/components/filter/` | 필터 패널·칩바 UI 컴포넌트 |
| `src/components/list/` | EntryRow·EntryListHeader 및 셀 컴포넌트 |
| `src/lib/` | 필터 매칭, 컬럼 정의, 단위 변환, 직렬화 등 순수 유틸 |
| `src/hooks/` | URL 상태·차트 미리보기·키보드 단축키 커스텀 훅 |
| `src/stores/` | Zustand 전역 상태 (차트 모달, UI, 옵션 컬럼 가시성) |
| `src/actions/` | Next.js Server Actions — 덱 로드, 차트 데이터 조회 |
| `src/providers/` | React Query `QueryClientProvider` 전역 조립 |

## 데이터 흐름

더 자세한 단계별 흐름은 [docs/architecture/data-flow.md](docs/architecture/data-flow.md)에서 확인할 수 있다.

```
URL 쿼리 (?dir=…)
  → [Server Action] loadDeckAction          (actions/deck.ts)
      → CSV 파싱                             (deck/loader.ts)
      → DB getThemeSnapshotAt               (data-core)
      → ThemeRowData[]
  → FilterState (URL ↔ Zustand)             (hooks/useFilterState.ts)
      → applyFilters / sortRows             (lib/filter, lib/sort)
      → EntryRow 렌더                        (components/list/EntryRow.tsx)
          → 클릭
          → [React Query] fetchChartPreviewAction  (actions/chartPreview.ts)
          → ChartModal                      (components/chart/ChartModal.tsx)
```

## 주요 라우트

| 경로 | 설명 |
|------|------|
| `/filtered` | 덱 로드 → 필터·정렬 → 리스트 조회 (메인 뷰) |
| `/from-date-theme` | 날짜·테마 기반 별도 조회 뷰 |
| `/chart/[stockCode]/[tradeDate]/[tradeTime]` | URL 직접 접근으로 차트 열람 |

## 변경 작업 가이드

| 시나리오 | 가이드 |
|----------|--------|
| 구조·설계 이유를 알고 싶을 때 | [docs/README.md](docs/README.md) |
| 새 필터 추가·제거 | [docs/adding-filter.md](docs/adding-filter.md) |
| EntryRow 컬럼 추가·삭제·순서 변경 | [docs/adding-entry-column.md](docs/adding-entry-column.md) |
| 차트 지표(이동평균·기준선 등) 추가 | [docs/adding-chart-indicator.md](docs/adding-chart-indicator.md) |
