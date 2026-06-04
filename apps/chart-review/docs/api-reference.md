# chart-review API 레퍼런스

이 문서는 `apps/chart-review`에서 외부 요청으로 호출되는 API route와, 유지보수 중 자주 직접 보게 되는 핵심 lib/hook 함수의 입력·출력 예시를 정리합니다.

## 1. 요청 흐름 한눈에

```text
Server pages
  app/page.tsx
  app/review/[code]/[date]/[time]/page.tsx
    -> loadReviewRows()
    -> loadManualKeys()
    -> groupSheetRows()

Client UI
  ReviewWorkspace
    -> GET /api/chart-preview
    -> GET /api/review/workset
    -> POST/DELETE /api/review/point
    -> GET/POST/PATCH/DELETE /api/review/manual-keys
    -> POST /api/review/export
    -> POST /api/review/import-merge
    -> POST /api/review/write-sheet/append
```

## 2. 공통 응답 규칙

- 성공 응답은 보통 `{ ok: true, ... }` 또는 실제 데이터 객체입니다.
- 실패 응답은 `{ error: string }`입니다.
- 잘못된 JSON 또는 필수값 누락은 대체로 `400`.
- DB/Sheet/서버 내부 오류는 대체로 `500`.
- 대부분 route는 최신 DB/쿠키/시트 설정을 읽어야 해서 `force-dynamic` 또는 동적 route로 동작합니다.

## 3. Chart Preview API

### `GET /api/chart-preview?stockCode=...&tradeDate=...`

역할: 현재 종목/거래일의 메인 일봉·분봉과 테마 오버레이 번들을 가져옵니다.

입력:

```text
GET /api/chart-preview?stockCode=005930&tradeDate=2026-05-27
```

성공 출력 예시:

```ts
{
  daily: [
    {
      time: 1811376000,
      krx: { open: 75000, high: 77000, low: 74500, close: 76500 },
      nxt: { open: 75100, high: 77100, low: 74600, close: 76600 },
      volumeKrx: 12000000,
      amountKrx: 920000000000,
      prevCloseKrx: 74000,
      prevCloseNxt: 74100
    }
  ],
  minute: [
    {
      time: 1811376000,
      krx: { open: 1.35, high: 1.62, low: 1.21, close: 1.48 },
      nxt: { open: 1.21, high: 1.48, low: 1.07, close: 1.34 },
      volume: 50000,
      amount: 3755000000,
      accAmount: 3755000000
    }
  ],
  prevCloseKrx: 74000,
  prevCloseNxt: 74100,
  themes: [
    {
      themeId: "10",
      themeName: "반도체",
      overlaySeries: [
        {
          stockCode: "005930",
          stockName: "삼성전자",
          isSelf: true,
          series: [{ time: 1811376000, valueKrx: 1.48, valueNxt: 1.34, amount: 3755000000, cumAmount: 3755000000 }],
          daily: [],
          minute: [],
          lineTargets: [75000],
          reviewPoints: [{ reviewId: "789", tradeTime: "09:12:00", payload: { result: "good" } }],
          isReviewTarget: true,
          hasReview: true
        }
      ]
    }
  ]
}
```

실패:

```ts
{ error: "stockCode 와 tradeDate 쿼리 파라미터가 필요합니다." }
```

주요 내부 함수:

```text
loadChartPreview()
  -> data-core getThemeBundle()
  -> toDailyChartCandle()
  -> buildMinuteCandles()
  -> buildThemeOverlayForBundle()
```

## 4. Point API

### `POST /api/review/point`

역할: 타점 1건을 입력하거나 수정합니다. `review_target`은 이미 존재해야 합니다.

입력:

```ts
{
  stockCode: "005930",
  tradeDate: "2026-05-27",
  tradeTime: "09:12",
  payload: {
    result: "good",
    tag: ["breakout", "volume"]
  }
}
```

처리:

- `tradeTime`이 `HH:MM`이면 `HH:MM:00`으로 정규화합니다.
- data-core `upsertReviewPoint()`를 호출합니다.
- 같은 target/time이 있으면 `payload_json`을 새 payload 전체로 덮어씁니다.

성공 출력:

```ts
{ id: "789" }
```

실패 예시:

```ts
{ error: "stockCode, tradeDate, tradeTime 이 필요합니다." }
```

### `DELETE /api/review/point`

입력:

```ts
{ reviewId: "789" }
```

성공 출력:

```ts
{ ok: true }
```

검증:

- `reviewId`가 없거나 숫자 문자열이 아니면 `400`.
- 삭제는 data-core `deleteReviewPointById()`가 수행합니다.

## 5. Manual Keys API

수동 입력 컬럼 레지스트리(`review_manual_key`)를 관리합니다.

### `GET /api/review/manual-keys`

출력:

```ts
[
  { key: "result", label: "결과", sortOrder: 0 },
  { key: "tag", label: null, sortOrder: 1 }
]
```

### `POST /api/review/manual-keys`

입력:

```ts
{ key: "result", label: "결과" }
```

성공:

```ts
{ ok: true }
```

검증:

- `key` 필수.
- 영문/숫자/밑줄만 허용.
- 이미 있으면 data-core에서 `onConflictDoNothing`이라 멱등입니다.

### `PATCH /api/review/manual-keys`

입력:

```ts
{ from: "result", to: "grade" }
```

성공:

```ts
{ ok: true, renamedPayloads: 12 }
```

처리:

- 레지스트리 key를 바꿉니다.
- 모든 `review_point.payload_json`에서 `result` 값을 `grade` 키로 이동합니다.

### `DELETE /api/review/manual-keys`

입력:

```ts
{ key: "grade" }
```

성공:

```ts
{ ok: true, purged: 12 }
```

주의: 파괴적 삭제입니다. 레지스트리뿐 아니라 모든 payload에서 해당 key가 제거됩니다.

## 6. Read Sheet API

### `GET /api/review/read-sheet`

역할: 현재 브라우저의 읽기 Sheet 설정과 Sheet 자격증명 여부를 반환합니다.

출력:

```ts
{
  spreadsheetId: "sheet-id",
  tab: "review",
  source: "cookie",
  hasCredentials: true
}
```

`source`는 `cookie`, `env`, `none` 중 하나입니다.

### `POST /api/review/read-sheet`

입력:

```ts
{
  spreadsheetId: "sheet-id",
  tab: "watchlist"
}
```

성공:

```ts
{ ok: true, spreadsheetId: "sheet-id", tab: "watchlist" }
```

효과:

- `cr_read_sheet` httpOnly cookie에 `{ id, tab }` JSON을 저장합니다.
- Google 서비스 계정 자격증명은 쿠키가 아니라 env에서만 읽습니다.

### `DELETE /api/review/read-sheet`

성공:

```ts
{ ok: true }
```

효과: `cr_read_sheet` 쿠키를 지웁니다. 이후 env 기본 Sheet가 있으면 env로 fallback하고, 없으면 DB 전체 모드로 동작합니다.

## 7. Workset / Tabs API

### `GET /api/review/sheets/tabs`

출력:

```ts
{
  tabs: ["review", "watchlist", "done"],
  spreadsheetId: "sheet-id"
}
```

Sheet 설정 또는 자격증명이 없으면:

```ts
{ tabs: [], spreadsheetId: null }
```

### `GET /api/review/workset?tab=review`

역할: 특정 Sheet Tab을 작업셋으로 읽고 `ReviewStockGroup[]` 형태로 반환합니다.

출력:

```ts
{
  tab: "review",
  groups: [
    {
      groupKey: "005930|2026-05-27",
      stockCode: "005930",
      stockName: "삼성전자",
      tradeDate: "2026-05-27",
      points: [
        {
          pointKey: "789",
          tradeTime: "09:12",
          rowNumber: 1,
          reviewId: "789",
          manualSummary: { filledCount: 1, totalCount: 1, missingRequired: [], preview: {} },
          sourceRow: { stockCode: "005930", tradeDate: "2026-05-27", manual: { result: "good" }, features: {} }
        }
      ]
    }
  ]
}
```

내부 흐름:

```text
loadReviewRowsForTab(spreadsheetId, tab)
  -> fetchSheetRowsAction()
  -> stockCode/tradeDate dedupe
  -> findReviewLoadTargets()
  -> groupSheetRows()
```

### `GET /api/review/workset`

역할: Sheet 설정과 무관하게 DB 전체 작업셋을 반환합니다.

출력:

```ts
{
  source: "db",
  groups: [/* ReviewStockGroup[] */]
}
```

## 8. Fields API

### `GET /api/review/fields`

역할: DB 전체 review row에서 수집 가능한 feature/manual 필드 키 목록을 반환합니다. Export 필드 설정에서 사용합니다.

출력:

```ts
{
  featureKeys: ["changeRate5m", "lineTargets", "tradingAmount"],
  manualKeys: ["m_result", "m_tag"]
}
```

내부적으로 `loadReviewRowsFromDb()`를 사용하므로 Sheet 작업셋과 무관하게 전체 DB 기준입니다.

## 9. Export API

### `POST /api/review/export`

역할: DB review 데이터를 Google Sheet로 씁니다.

입력:

```ts
{
  spreadsheetId: "sheet-id",
  tab: "export",
  scope: "working",
  filters: {
    result: ["good"],
    tag: ["breakout", "volume"]
  }
}
```

입력 필드:

| 필드 | 설명 |
|------|------|
| `spreadsheetId` | 생략 시 `GOOGLE_SHEETS_ID` |
| `tab` | 생략 시 `GOOGLE_SHEETS_TAB` 또는 `review` |
| `scope` | `"working"` 기본. `"all"`이면 DB 전체 |
| `filters` | m_ payload 필터. key 간 AND, value 간 OR |

성공:

```ts
{
  ok: true,
  tab: "export",
  rows: 42,
  cols: 36,
  filtered: true,
  scope: "working"
}
```

내부 흐름:

```text
resolveWorkingSetKeys()       // scope=working일 때
findReviewExportRows()
payloadMatchesManualFilters()
buildSheetMatrix()
writeSheetTab()
```

주의: `scope="working"`이어도 읽기 Sheet가 설정되어 있지 않으면 DB 전체와 동일하게 동작합니다.

## 10. Import Merge API

### `POST /api/review/import-merge`

역할: Sheet의 비어있지 않은 `m_` 값을 DB `payload_json`에 병합합니다.

입력:

```ts
{
  spreadsheetId: "sheet-id",
  tab: "review"
}
```

본문 없이 호출하면 현재 읽기 Sheet 설정을 사용합니다.

성공:

```ts
{
  ok: true,
  tab: "review",
  total: 100,
  merged: 80,
  skippedNoValues: 15,
  skippedNotFound: 5,
  notFoundRefs: ["행12 005930 2026-05-27 09:12"]
}
```

처리 규칙:

- Sheet row의 `m_` 컬럼만 대상입니다.
- 빈 셀은 무시합니다. 삭제로 해석하지 않습니다.
- `reviewId`가 있으면 우선 사용합니다.
- `reviewId`가 없거나 못 찾으면 `(stockCode, tradeDate, tradeTime)` 좌표로 찾습니다.
- 멀티값은 `"a | b"`를 `["a", "b"]`로 파싱합니다.

## 11. Write Sheet Append API

### `POST /api/review/write-sheet/append`

역할: 현재 active point에서 추출한 값 1행을 Write Tab 마지막 줄에 추가합니다. `f` 키가 이 API를 호출합니다.

입력:

```ts
{
  writeTab: "selected",
  headers: ["stockCode", "tradeDate", "tradeTime", "m_result"],
  values: ["005930", "2026-05-27", "09:12", "good"]
}
```

성공 예시:

```ts
{
  ok: true,
  appended: true,
  rowCount: 1
}
```

실제 추가 결과의 세부 필드는 `appendSheetRow()` 반환값에 따라 붙습니다. 탭이 비어 있으면 헤더도 함께 추가합니다.

## 12. CSV Import API

### `GET /api/review/import-csv`

역할: capture CSV 디렉터리 상태를 확인합니다.

출력:

```ts
{
  dir: "C:\\data\\capture",
  source: "env",
  exists: true,
  pending: 2,
  pendingFiles: ["Capture-2026-05-27.csv", "Capture-2026-05-28.csv"]
}
```

### `POST /api/review/import-csv`

역할: `Capture-*.csv` 파일을 읽어 `review_target`으로 upsert하고 처리한 파일을 `processed/`로 이동합니다.

성공:

```ts
{
  ok: true,
  dir: "C:\\data\\capture",
  totalFiles: 1,
  totalTargets: 25,
  processed: [{ name: "Capture-2026-05-27.csv", targets: 25 }],
  errors: []
}
```

내부 흐름:

```text
getCaptureDir()
listCaptureFiles()
parseCaptureCsv()
upsertReviewTargets()
rename(file, processed/file)
```

## 13. 핵심 lib 함수

### `loadReviewRows()`

입력: 없음. 쿠키/env Sheet 설정과 `DATABASE_URL`을 내부에서 읽습니다.

출력:

```ts
[
  {
    reviewId: "789",
    rowNumber: 1,
    stockCode: "005930",
    stockName: "삼성전자",
    tradeDate: "2026-05-27",
    tradeTime: "09:12",
    features: { changeRate5m: "0.82", lineTargets: "75000 | 77000" },
    manual: { result: "good", tag: "breakout | volume" }
  }
]
```

작업셋 Sheet가 있으면 Sheet에서 `(stockCode, tradeDate)`만 읽고, 실제 point/manual/feature는 DB에서 가져옵니다.

### `loadReviewRowsForTab(spreadsheetId, tab)`

입력:

```ts
await loadReviewRowsForTab("sheet-id", "watchlist");
```

출력: `SheetPointRow[]`

특정 Sheet Tab 전환 API에서 씁니다.

### `loadReviewRowsFromDb()`

입력: 없음

출력: DB 전체 `SheetPointRow[]`

DB 모드와 `/api/review/fields`에서 씁니다.

### `groupSheetRows(rows)`

입력:

```ts
[
  { stockCode: "005930", tradeDate: "2026-05-27", tradeTime: "10:30", reviewId: "12", ... },
  { stockCode: "005930", tradeDate: "2026-05-27", tradeTime: "09:12", reviewId: "11", ... }
]
```

출력:

```ts
[
  {
    groupKey: "005930|2026-05-27",
    stockCode: "005930",
    tradeDate: "2026-05-27",
    points: [
      { pointKey: "11", tradeTime: "09:12", ... },
      { pointKey: "12", tradeTime: "10:30", ... }
    ]
  }
]
```

그룹은 첫 등장 순서를 유지하고, 그룹 안 point는 `tradeTime` 오름차순입니다.

### `resolveInitialSelection(groups, seed)`

입력:

```ts
resolveInitialSelection(groups, {
  stockCode: "005930",
  tradeDate: "2026-05-27",
  tradeTime: "09:12:00"
});
```

출력:

```ts
{ selectedGroupIndex: 0, selectedPointKey: "789" }
```

`HH:MM:00`과 `HH:MM`을 같은 시각으로 봅니다. URL이 작업셋 밖이면 첫 그룹/첫 point로 fallback합니다.

### `createReviewCommands(groups, navigableIndices?)`

입력:

```ts
const commands = createReviewCommands(groups, [0, 2, 5]);
```

반환:

```ts
{
  nextGroup,
  prevGroup,
  nextPoint,
  prevPoint,
  selectPoint,
  setViewMode,
  goToGroup
}
```

효과:

- `useReviewStore`의 선택 상태를 갱신합니다.
- `window.history.replaceState()`로 URL을 미러링합니다.
- `navigableIndices`가 있으면 q/e 그룹 이동은 그 목록 안에서만 움직입니다.

### `payloadMatchesManualFilters(payload, filters)`

입력:

```ts
payloadMatchesManualFilters(
  { result: "good", tag: "breakout | volume" },
  { result: ["good"], tag: ["volume"] }
)
```

출력:

```ts
true
```

키 간 AND, 같은 키의 값 간 OR입니다.

### `mergePresetIntoManual(existingManual, entries)`

입력:

```ts
mergePresetIntoManual(
  { result: "watch", tag: "volume" },
  [
    { key: "result", action: "overwrite", value: "good" },
    { key: "tag", action: "append", value: "breakout" }
  ]
)
```

출력:

```ts
{
  payload: { result: "good", tag: ["volume", "breakout"] },
  summary: "m_result=good, m_tag+breakout"
}
```

이 결과 payload는 `POST /api/review/point`로 보내는 완성 payload입니다.

### `buildExploredGroup(params)`

입력:

```ts
buildExploredGroup({
  stockCode: "005930",
  stockName: "삼성전자",
  tradeDate: "2026-05-27",
  lineTargets: [75000],
  reviewPoints: [
    { reviewId: "789", tradeTime: "09:12:00", payload: { result: "good" } }
  ]
});
```

출력:

```ts
{
  groupKey: "005930|2026-05-27",
  stockCode: "005930",
  stockName: "삼성전자",
  tradeDate: "2026-05-27",
  points: [
    {
      pointKey: "789",
      tradeTime: "09:12",
      sourceRow: {
        features: { lineTargets: "75000" },
        manual: { result: "good" }
      }
    }
  ]
}
```

테마 멤버 임시 탐색에서 작업셋과 같은 Point List 구조를 만들기 위해 씁니다.

### `computeThemeMemberMetrics(series, markerTime, mode, thresholdsEok)`

입력:

```ts
computeThemeMemberMetrics(overlaySeries, 1811376720, "krx", [50, 70, 100]);
```

출력:

```ts
[
  {
    stockCode: "005930",
    stockName: "삼성전자",
    isSelf: true,
    hasReview: true,
    isReviewTarget: true,
    rate: 4.2,
    dayHighRate: 5.1,
    cumAmount: 120000000000,
    amount: 3000000000,
    distribution: { 50: 2, 70: 1, 100: 0 }
  }
]
```

`markerTime`이 `null`이면 시리즈의 마지막 시점을 기준으로 계산합니다.

## 14. Hook/Store 요약

### `useChartPreview(params)`

입력:

```ts
useChartPreview({ stockCode: "005930", tradeDate: "2026-05-27" });
```

출력: React Query result. `data`는 `ChartPreviewDTO`, `error`는 `Error | null`.

### `useWorkingSetCache(initialGroups, initialTab, initialReadSource?)`

반환:

```ts
{
  tabs,
  readTab,
  groups,
  isLoadingWorkset,
  readSource,
  switchTab,
  switchToDb,
  reloadTab,
  reloadAll
}
```

특징:

- 초기 groups는 서버 렌더에서 받은 값을 그대로 사용합니다.
- 마운트 후 탭 목록을 조회하고 다른 탭을 background preload합니다.
- 빈 탭으로 전환하면 가능한 경우 다른 비어있지 않은 탭으로 fallback합니다.

### `useGlobalShortcuts(options)`

주요 입력:

```ts
{
  enabled,
  onPrevGroup,
  onNextGroup,
  onMarkerLeft,
  onMarkerRight,
  onPrevPoint,
  onNextPoint,
  onThemeUp,
  onThemeDown,
  onCycleView,
  onResetOverride,
  onOpenInput,
  onWriteAppend,
  onCycleReadTab,
  onTogglePriceMode,
  onToggleMinuteZoom
}
```

가드:

- `enabled=false`면 무시합니다.
- `INPUT`, `TEXTAREA`, `SELECT`, `contentEditable` 포커스에서는 무시합니다.
- Ctrl/Meta는 `a/d` 타점 이동만 처리하고, 나머지 조합은 브라우저/OS에 양보합니다.
- Alt 조합은 무시합니다.

### `useReviewStore`

세션 상태:

```ts
{
  selectedGroupIndex,
  selectedPointKey,
  viewMode,
  chartOverride,
  history
}
```

persist하지 않습니다. 새로고침 후에는 URL seed로 다시 선택합니다.

### `useUiStore`

`localStorage: chart-review-ui`에 저장:

```ts
{
  chartPriceMode,
  headerFieldKeys,
  pointFieldKeys,
  manualFilters,
  writeTab,
  exportFieldKeys,
  tabPositions,
  cycleTabList,
  inputKeyOrder,
  inputKeyDisabled,
  quickPresetGroups,
  minuteZoomCandles,
  minuteClipEnd
}
```

브라우저별 작업 설정과 취향 설정을 담습니다.

## 15. 테스트가 있는 계약

현재 순수 로직 테스트가 있는 영역:

| 영역 | 테스트 파일 |
|------|-------------|
| Sheet parsing | `src/lib/__tests__/parseSheet.test.ts` |
| row grouping | `src/lib/__tests__/groupSheetRows.test.ts` |
| quick preset merge | `src/lib/__tests__/quickPreset.test.ts` |
| manual filter | `src/lib/__tests__/manualFilter.test.ts` |
| selection/url | `src/lib/__tests__/selectionUrl.test.ts` |
| explored group | `src/lib/__tests__/buildExploredGroup.test.ts` |
| review commands | `src/lib/__tests__/reviewCommands.test.ts` |

DB나 Google Sheet가 필요한 route 자체는 아직 통합 테스트가 아니라 lib/repository 쪽 계약으로 보호합니다. 통합 테스트를 추가할 때는 `TEST_DATABASE_URL`이 있는 경우에만 실행하는 방식이 적합합니다.
