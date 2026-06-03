# 아키텍처 / 코드 흐름

## 1. 큰 그림

```
Google Sheet (작업셋 정의 / 내보내기 매체)
        │  stockCode, tradeDate 만 읽음
        ▼
resolveWorkingSetKeys ──▶ loadReviewRows ──▶ PostgreSQL (진실 원천)
        ▲                                         │ review_target / review_point / review_manual_key
        │                                         ▼
   쿠키/env 설정                          ReviewWorkspace (클라이언트 복기 UI)
```

- **DB가 진실 원천(SSOT)**. 시트는 (a) 어떤 그룹을 볼지 고르는 작업셋 정의, (b) 사람이 보기 좋은 내보내기/가져오기 매체로만 쓴다. → [decisions/002](./decisions/002-sheet-to-db-source-of-truth.md)
- 페이지는 모두 `export const dynamic = "force-dynamic"` — 요청마다 작업셋을 새로 해석한다(쿠키별 독립 작업셋).

---

## 2. 데이터 로딩 경로 (서버)

진입점은 두 라우트. 둘 다 `loadReviewRows()`로 작업셋을 만든다.

```
app/page.tsx (HomePage)
  └─ loadReviewRows() → 첫 행으로 redirect(/review/[code]/[date]/[time])

app/review/[code]/[date]/[time]/page.tsx (ReviewPage)
  ├─ loadReviewRows()      // SheetPointRow[]
  ├─ loadManualKeys()      // 수동 키 레지스트리
  ├─ groupSheetRows(rows)  // (code,date) 별 ReviewStockGroup[] 로 묶기
  ├─ resolveInitialSelection(groups, params)  // URL → 초기 선택
  └─ <ReviewWorkspace groups initialSelection manualKeys />
```

### `loadReviewRows()` (`src/lib/loadReviewRows.ts`)

1. `resolveWorkingSetKeys()` 호출 → 작업셋 키 목록 또는 `null`.
   - `null`: 읽기 시트 미설정 → **DB 전체 타깃(최근순)** 로드.
   - `[]`: 시트는 연결됐지만 행이 없음 → **빈 결과**(그릴 게 없음).
   - `[{stockCode, tradeDate}, ...]`: 그 키들만 로드.
2. `DATABASE_URL`이 없으면 **mock(`src/mock/sheetRows.ts`)** 으로 폴백.
3. `findReviewLoadTargets(db, { keys })` (data-core) → Target + Point 조인 로드.
4. `toSheetPointRows()`로 평탄화. 타점이 없는 Target도 빈 `tradeTime` 행 1개로 노출(사이드바에 보이도록).

### `resolveWorkingSetKeys()` (`src/lib/workingSet.ts`)

- `getReadSheetConfig()`로 시트 설정 해석 → 시트가 없거나 자격증명이 없으면 `null`.
- 시트 행을 읽어 `(stockCode, tradeDate)` 기준 dedupe → `ReviewLoadKey[]`.
- **`tradeTime`/`m_`/feature 컬럼은 무시**한다(타점은 DB가 진실).

### `getReadSheetConfig()` (`src/lib/readSheetConfig.ts`)

- 우선순위: **쿠키 `cr_read_sheet`(JSON `{id, tab}`) → env `GOOGLE_SHEETS_ID`/`GOOGLE_SHEETS_TAB` → none**.
- 기본 탭 `"review"`. 자격증명(서비스 계정)은 **항상 env에서만** 읽는다.

---

## 3. 라우팅

| 경로 | 역할 |
|------|------|
| `/` | `loadReviewRows()` 첫 행으로 redirect. 비면 `notFound()`. |
| `/review/[code]/[date]/[time]` | 메인 복기 화면. URL이 초기 선택을 정한다. |

클라이언트 내 그룹/타점 이동은 페이지 네비게이션 없이 `window.history.replaceState`로 URL만 동기화한다(`reviewCommands.mirrorUrl`). 현재 작업셋에 없는 GroupId로 점프할 때만 `router.push`로 풀 네비게이션.

---

## 4. API 라우트 (`src/app/api/review/*`)

| 라우트 | 메서드 | 역할 |
|--------|--------|------|
| `point` | POST/DELETE | 타점 upsert / 삭제 |
| `manual-keys` | GET/POST/PATCH/DELETE | 수동 키 레지스트리 CRUD (DELETE는 payload까지 파괴적 제거) |
| `read-sheet` | GET/POST/DELETE | 작업셋 시트 설정(쿠키) 조회/저장/해제 |
| `export` | POST | DB → Sheet 내보내기(working/all scope + 필터) |
| `import-merge` | POST | Sheet → DB 병합(빈 셀 무시) |
| `import-csv` | POST | CSV 대량 입력 |
| `chart-preview` (`api/chart-preview`) | — | 차트(일봉/분봉/테마) 미리보기 데이터 |

---

## 5. 데이터 모델 (data-core `schema/review.ts`)

```
review_target         하나의 (stockCode, tradeDate). lineTargets(jsonb), stockName, sourceFile
  └─ review_point     target 당 N개. tradeTime, payload_json(수동 입력 m_ 값)
review_manual_key     수동 입력 키 전역 레지스트리(key, label, sortOrder)
```

- `review_target` 유니크: `(stock_code, trade_date)`.
- `review_point` 유니크: `(review_target_id, trade_time)`.
- `review_manual_key`는 입력 모달의 행 구성과 Export의 `m_` 컬럼 순서를 정의한다.

---

## 6. 클라이언트 상태 (`ReviewWorkspace` + zustand)

`ReviewWorkspace.tsx`가 복기 UI 전체의 컨테이너다(현재 단일 파일 ~1700줄, 14개 컴포넌트 — Phase 3 분리 대상).

### `useReviewStore` (세션 상태, 비영속)
- `selectedGroupIndex`, `selectedPointKey`, `viewMode`, `chartOverride`(사이드바 임시 탐색), `history`(MRU 30).
- 그룹/타점을 바꾸면 `chartOverride`는 항상 해제.

### `useUiStore` (영속, `localStorage: chart-review-ui`)
- `chartPriceMode`(krx/nxt), `headerFieldKeys`, `pointFieldKeys`, `manualFilters`.

### 커맨드 레이어 (`src/lib/reviewCommands.ts`)
- `createReviewCommands(groups, navigableIndices)` → `nextGroup/prevGroup/nextPoint/prevPoint/selectPoint/setViewMode/goToGroup`.
- 필터 활성 시 `navigableIndices`만 순회. 선택과 동시에 store 갱신 + URL 미러링.

### 주의 패턴
- `force-dynamic` 페이지는 서버 액션마다 새 `initialSelection` 객체를 만든다 → `useEffect` 의존성을 **객체 참조가 아니라 원시값**(`selectedGroupIndex`, `selectedPointKey`)으로 둬야 store churn/무한 재조회를 피한다.
- a/d 빠른 순회 시 중간 종목 차트를 매번 긁지 않도록 차트 fetch 파라미터를 **200ms 디바운스**(`useDebouncedValue`).

---

## 7. 디렉터리 맵

```
src/
├── app/
│   ├── page.tsx                         # 첫 행으로 redirect
│   ├── review/[code]/[date]/[time]/     # 메인 복기 페이지
│   └── api/                             # chart-preview, review/* 라우트
├── components/
│   ├── chart/                           # 일봉/분봉/오버레이 차트 + hooks/tooltip (data-view fork)
│   └── review/                          # ReviewWorkspace, PointInputDrawer, 모달들, HistorySwitcher 등
├── lib/                                 # 도메인 로직
│   ├── loadReviewRows / workingSet / readSheetConfig   # 작업셋 해석
│   ├── reviewCommands / selection / url / groupSheetRows
│   ├── manualFilter / manualSummary / parseSheet / serialization
│   ├── sheetsWriter / captureCsv                       # Sheet 입출력
│   └── constants / colors / format / chartPadding      # 상수·유틸
├── stores/                              # useReviewStore, useUiStore
├── hooks/                               # useChartPreview
├── types/                               # review, chart
└── mock/                                # DATABASE_URL 없을 때 폴백 데이터
```

> 차트 React 코어(`components/chart/*`)는 (현재는 삭제된) `data-view` 앱에서 fork 해온 것이다. 공유 패키지로 추출하지 않은 이유는 [decisions/001](./decisions/001-fork-from-data-view.md) 참조.
