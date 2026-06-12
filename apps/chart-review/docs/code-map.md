# chart-review 코드 지도

이 문서는 `apps/chart-review`의 최신 코드 기준 구조 설명입니다. “기능을 고치려면 어디를 봐야 하는가”에 초점을 맞춥니다.

## 1. 한 줄 요약

`chart-review`는 DB의 `review_target` / `review_point`를 진실 원천으로 삼고, Google Sheet는 작업셋 선택과 사람이 보기 좋은 입출력 매체로 씁니다. 화면은 `(stockCode, tradeDate)` 그룹을 빠르게 탐색하고, 그룹 안의 `tradeTime` 타점을 입력/수정/삭제하는 도구입니다.

## 2. 런타임 흐름

```text
브라우저 GET /
  -> app/page.tsx
  -> loadReviewRows()
  -> 첫 그룹/타점으로 redirect

브라우저 GET /review/[code]/[date]/[time]
  -> app/review/[code]/[date]/[time]/page.tsx
  -> getReadSheetConfig()
  -> loadReviewRows() 또는 loadReviewRowsForTab()
  -> loadManualKeys()
  -> groupSheetRows()
  -> resolveInitialSelection()
  -> <ReviewWorkspace />

ReviewWorkspace
  -> useWorkingSetCache(): Sheet Tab/DB 작업셋 캐시
  -> useChartPreview(): /api/chart-preview GET
  -> useGlobalShortcuts(): q/e/a/d/w/s/z...
  -> API routes: point/manual-keys/export/import/write-sheet...
```

## 3. 디렉터리 책임

| 위치 | 책임 |
|------|------|
| `src/app` | Next App Router 페이지와 API route |
| `src/actions` | 서버에서 실행되는 DB/Google Sheet 액션 |
| `src/components/review` | 복기 UI. `ReviewWorkspace`가 화면 전체 조립 |
| `src/components/chart` | lightweight-charts 기반 차트 컴포넌트와 hooks |
| `src/hooks` | UI가 쓰는 React hook. 전역 단축키, 차트 preview, 작업셋 캐시 |
| `src/lib` | 도메인/순수 로직과 앱 glue code |
| `src/stores` | Zustand 상태. 세션 상태와 localStorage 상태가 분리됨 |
| `src/types` | chart/review 타입 |
| `src/mock` | `DATABASE_URL`이 없을 때 fallback row |

## 4. 작업셋 로딩

관련 파일:

| 파일 | 역할 |
|------|------|
| `src/lib/readSheetConfig.ts` | 쿠키/env에서 읽기 Sheet 설정 해석 |
| `src/lib/workingSet.ts` | Sheet에서 `stockCode`, `tradeDate`만 dedupe해 작업셋 key 생성 |
| `src/lib/loadReviewRows.ts` | key를 data-core `findReviewLoadTargets()`에 넘겨 UI row 생성 |
| `src/hooks/useWorkingSetCache.ts` | 클라이언트에서 탭별 작업셋 캐시, DB 모드 전환, reload |
| `src/app/api/review/workset/route.ts` | 클라이언트 탭 전환용 작업셋 API |
| `src/app/api/review/sheets/tabs/route.ts` | 스프레드시트 탭 목록 API |

작업셋의 반환 형태는 UI가 바로 그룹화할 수 있는 `SheetPointRow[]`입니다.

예시 입력 Sheet:

```csv
stockCode,tradeDate,tradeTime,m_result
005930,2026-05-27,09:12,good
005930,2026-05-27,10:30,bad
000660,2026-05-27,09:05,watch
```

작업셋 해석 단계에서는 `tradeTime`, `m_result`를 버리고 다음 key만 남깁니다.

```ts
[
  { stockCode: "005930", tradeDate: "2026-05-27" },
  { stockCode: "000660", tradeDate: "2026-05-27" },
]
```

그 뒤 DB에서 실제 point와 payload를 읽습니다. Sheet는 “무엇을 볼지”만 정하고, “무슨 타점/값이 저장되어 있는지”는 DB가 정합니다.

## 5. 화면 상태

| store | 저장 위치 | 담는 값 |
|-------|-----------|---------|
| `useReviewStore` | 메모리 | 선택 그룹/타점, 뷰 모드, 임시 탐색 override, 히스토리 |
| `useUiStore` | `localStorage: chart-review-ui` | KRX/NXT, 표시 필드, 필터, Write Tab, Export 필드, 탭 위치, 프리셋, 분봉 확대 설정 |

`useReviewStore`는 페이지 새로고침 후 복원할 필요가 적은 “현재 화면 조작 상태”입니다. `useUiStore`는 브라우저별 취향/작업 설정이라 localStorage에 남깁니다.

중요 패턴:

- 그룹/타점이 바뀌면 `chartOverride`는 해제됩니다.
- Read Tab/DB 모드 전환 전 현재 위치를 `tabPositions`에 저장하고, 돌아오면 복원합니다.
- 필터가 켜져 있으면 그룹 이동 순회 대상은 “매칭 타점이 있는 그룹”으로 줄어듭니다.
- `initialSelection` 객체는 `force-dynamic` 렌더마다 새 참조가 되므로 effect 의존성은 객체가 아니라 원시값을 씁니다.

## 6. 탐색과 단축키

단축키 정의:

- 키 상수: `src/lib/shortcuts.ts`
- DOM keydown 가드: `src/hooks/useGlobalShortcuts.ts`
- 실제 콜백 연결: `src/components/review/ReviewWorkspace.tsx`

주요 흐름:

```text
keydown
  -> useGlobalShortcuts
    -> 입력창/모달/contentEditable이면 무시
    -> Ctrl/Meta+a/d는 타점 이동
    -> Shift+a/d는 마커 20분 이동
    -> 일반 q/e/a/d/w/s/z...는 ReviewWorkspace 콜백 호출
```

최신 단축키 표는 [usage.md](./usage.md)를 기준으로 보면 됩니다.

## 7. 차트 preview

```text
ReviewWorkspace
  -> useChartPreview({ stockCode, tradeDate })
    -> GET /api/chart-preview
      -> loadChartPreview()
        -> data-core getThemeBundle()
        -> toDailyChartCandle()
        -> buildMinuteCandles()
        -> buildThemeOverlayForBundle()
        -> ChartPreviewDTO
```

관련 파일:

| 파일 | 역할 |
|------|------|
| `src/hooks/useChartPreview.ts` | React Query로 `/api/chart-preview` 호출 |
| `src/app/api/chart-preview/route.ts` | GET route handler |
| `src/lib/chart/loadChartPreview.ts` | data-core bundle을 차트 DTO로 변환 |
| `src/lib/chart/mappers.ts` | raw row를 daily/minute/overlay point로 변환 |
| `src/lib/chart/overlay.ts` | 테마 멤버별 오버레이 시리즈 생성 |
| `src/components/chart/RealDailyChart.tsx` | 일봉 차트 |
| `src/components/chart/RealMinuteChart.tsx` | 분봉 차트 |
| `src/components/chart/RealThemeOverlayChart.tsx` | 테마 오버레이 단독 뷰 |

`ReviewWorkspace`는 빠른 q/e 탐색 때 차트 API를 너무 자주 치지 않도록 `CHART_PARAMS_DEBOUNCE_MS` 만큼 fetch 파라미터를 디바운스합니다. 헤더와 선택 상태는 즉시 바뀌고, 차트 요청만 짧게 늦습니다.

## 8. 테마 사이드바와 임시 탐색

관련 파일:

| 파일 | 역할 |
|------|------|
| `src/components/review/ThemeSidebar.tsx` | 테마 멤버 리스트 표시 |
| `src/lib/themeMetrics.ts` | marker 시각 기준 등락률/거래대금 metric 계산 |
| `src/lib/buildExploredGroup.ts` | 작업셋 밖/테마 멤버 review 데이터를 UI 그룹 형태로 조립 |

동작:

1. 현재 종목 기준으로 `getThemeBundle()`이 같은 테마 멤버들의 일봉/분봉/피처/review를 가져옵니다.
2. 사이드바에서 멤버를 클릭하면 `chartOverride`가 설정됩니다.
3. override 중에는 작업셋 선택은 그대로 두고 차트/Point List만 탐색 종목 기준으로 바뀝니다.
4. `c` 또는 “본 종목으로” 버튼을 누르면 override가 해제됩니다.

작업셋 밖 GroupId를 붙여넣은 경우도 풀 네비게이션 대신 override 탐색으로 처리합니다. 번들에 없을 수 있으므로 `exploreAnchor`를 붙여 새 chart-preview 요청을 보냅니다.

## 9. 타점 입력/수정/삭제

관련 파일:

| 파일 | 역할 |
|------|------|
| `src/components/review/PointInputDrawer.tsx` | 타점 입력 드로어 |
| `src/app/api/review/point/route.ts` | point upsert/delete API |
| `packages/data-core/src/repositories/review.repository.ts` | `upsertReviewPoint`, `deleteReviewPointById` |
| `src/lib/loadManualKeys.ts` | 수동 키 레지스트리 로드 |
| `src/app/api/review/manual-keys/route.ts` | 수동 키 CRUD |

입력 예시:

```ts
POST /api/review/point
{
  "stockCode": "005930",
  "tradeDate": "2026-05-27",
  "tradeTime": "09:12",
  "payload": {
    "result": "good",
    "tag": ["breakout", "volume"]
  }
}
```

DB에는 `review_point.payload_json`으로 저장되고, UI로 다시 읽을 때 배열은 `"breakout | volume"` 문자열로 표시됩니다.

드로어 규칙:

- 현재 마커 시각과 같은 point가 있으면 수정 모드, 없으면 신규 모드입니다.
- 신규 point는 같은 종목/날짜의 기존 point manual 값을 기본 복사합니다.
- Enter는 현재 입력값을 칩으로 확정합니다.
- `Ctrl+Space`는 저장, `Esc`는 닫기입니다.
- 숨김 처리된 입력 컬럼은 신규에서는 빈 값, 수정에서는 기존 값 유지입니다.

## 10. 수동 키 레지스트리

수동 입력 컬럼의 정의는 `review_manual_key`에 있습니다.

| API | data-core 함수 | 설명 |
|-----|----------------|------|
| `GET /api/review/manual-keys` | `listManualKeys()` | 정렬된 키 목록 |
| `POST /api/review/manual-keys` | `addManualKey()` | 키 추가, 이미 있으면 무시 |
| `PATCH /api/review/manual-keys` | `renameManualKey()` | 키 이름 변경, payload key도 이동 |
| `DELETE /api/review/manual-keys` | `deleteManualKey()` | 키 삭제, 모든 payload에서도 제거 |

삭제는 파괴적입니다. `payload_json - key`로 기존 타점 데이터에서도 해당 키가 사라집니다.

## 11. Sheet Export/Import/Append

관련 파일:

| 기능 | 코드 |
|------|------|
| 전체/작업셋 Export | `src/app/api/review/export/route.ts` |
| Sheet merge import | `src/app/api/review/import-merge/route.ts` |
| CSV import | `src/app/api/review/import-csv/route.ts` |
| f 키 append | `src/app/api/review/write-sheet/append/route.ts` |
| Google Sheets 쓰기 | `src/lib/sheetsWriter.ts` |
| Sheet row 파싱 | `src/lib/parseSheet.ts` |
| Export matrix 생성 | `src/lib/buildSheetMatrix.ts` (Sheet 계층) |

Export는 data-core `findReviewExportRows()`로 DB row를 모으고, 앱 Sheet 계층의 `buildSheetMatrix()`(`src/lib/buildSheetMatrix.ts`)로 2차원 문자열 배열을 만든 뒤 Google Sheet에 씁니다. 즉 DB 조회는 data-core, 시트 표현 변환(헤더·`m_` 접두·`" | "` 결합·셀 normalize)은 앱이 담당합니다.

Import merge는 빈 셀을 삭제로 해석하지 않습니다. 비어있지 않은 `m_` 값만 `payload_json || newValues`로 병합합니다.

`f` 키 append는 전체 Export와 다릅니다. 현재 보고 있는 active point에서 `useUiStore.exportFieldKeys` 순서대로 값을 뽑아 Write Tab 마지막 행에 1줄만 추가합니다.

## 12. 숫자 프리셋

관련 파일:

| 파일 | 역할 |
|------|------|
| `src/lib/quickPreset.ts` | 프리셋 타입, 기본 그룹, manual 병합 로직 |
| `src/components/review/PresetSwitcher.tsx` | 숫자 프리셋 선택 UI |
| `src/components/review/modals/SettingsModal.tsx` | 프리셋 설정 UI |
| `src/components/review/ReviewWorkspace.tsx` | 숫자키 핸들러와 적용 API 호출 |

구조:

```ts
[
  {
    hotkey: "1",
    presets: [
      {
        id: "p_abc",
        name: "돌파 좋음",
        entries: [
          { key: "result", action: "overwrite", value: "good" },
          { key: "tag", action: "append", value: "breakout" }
        ]
      }
    ]
  }
]
```

적용 결과:

```ts
mergePresetIntoManual(
  { result: "watch", tag: "volume" },
  [
    { key: "result", action: "overwrite", value: "good" },
    { key: "tag", action: "append", value: "breakout" }
  ]
)
```

반환:

```ts
{
  payload: { result: "good", tag: ["volume", "breakout"] },
  summary: "m_result=good, m_tag+breakout"
}
```

이 payload를 `POST /api/review/point`로 저장합니다. 프리셋 정의 자체는 DB가 아니라 `localStorage`에만 있습니다.

## 13. 기능별 수정 위치 빠른 표

| 바꾸고 싶은 것 | 먼저 볼 곳 |
|----------------|------------|
| 전역 단축키 키 변경 | `src/lib/shortcuts.ts` |
| 단축키 입력창/모달 가드 | `src/hooks/useGlobalShortcuts.ts` |
| q/e 이동 규칙 | `src/lib/reviewCommands.ts`, `ReviewWorkspace`의 `navigableIndices` |
| a/d 마커 이동 폭 | `src/lib/shortcuts.ts`의 `MARKER_WHEEL_STEP_MIN`, `MARKER_HOUR_STEP_MIN` |
| Read Tab 전환/캐시 | `src/hooks/useWorkingSetCache.ts`, `ReviewWorkspace.handleSwitchReadTab` |
| DB 모드 전환 | `useWorkingSetCache.switchToDb`, `ReviewWorkspace.handleToggleDbMode` |
| 필터 조건 | `src/lib/manualFilter.ts` |
| 헤더/Point List 필드 표시 | `useUiStore.headerFieldKeys`, `pointFieldKeys`, `SettingsModal` |
| 타점 입력 컬럼 순서/숨김 | `useUiStore.inputKeyOrder`, `inputKeyDisabled`, `PointInputDrawer` |
| 차트 tooltip | `src/components/chart/tooltip`, `src/components/chart/shell` |
| 분봉 확대 x키 | `ReviewWorkspace.minuteZoomed`, `RealMinuteChart`, `DEFAULT_MINUTE_ZOOM_CANDLES` |
| 가격 라인 | `src/lib/chart/priceLines.ts`, chart components |
| Sheet 탭 목록 | `src/lib/sheetsWriter.ts`, `/api/review/sheets/tabs` |
| Export 컬럼 | `useUiStore.exportFieldKeys`, `src/lib/sheetColumns.ts`(고정/`m_` 헤더), data-core `FEATURE_COLUMNS`(피처 투영) |
| Import merge 방식 | `src/app/api/review/import-merge/route.ts`, data-core `mergeReviewPointPayloads()` |

## 14. API route 지도

| Route | 메서드 | 입력 | 출력/효과 |
|-------|--------|------|-----------|
| `/api/chart-preview` | GET | `stockCode`, `tradeDate` query | 일봉/분봉/테마 오버레이 DTO |
| `/api/review/point` | POST | `stockCode`, `tradeDate`, `tradeTime`, `payload` | point upsert |
| `/api/review/point` | DELETE | `reviewId` | point 삭제 |
| `/api/review/manual-keys` | GET | 없음 | 수동 키 목록 |
| `/api/review/manual-keys` | POST | `{ key, label? }` | 키 추가 |
| `/api/review/manual-keys` | PATCH | `{ from, to }` | 키 이름 변경 |
| `/api/review/manual-keys` | DELETE | `{ key }` | 키와 payload 값 삭제 |
| `/api/review/read-sheet` | GET/POST/DELETE | Sheet id/tab | 읽기 Sheet 쿠키 조회/저장/삭제 |
| `/api/review/sheets/tabs` | GET | 없음 | 스프레드시트 탭 목록 |
| `/api/review/workset` | GET | `tab?` | 탭 또는 DB 전체 작업셋 |
| `/api/review/export` | POST | `spreadsheetId?`, `tab?`, `scope?`, `filters?` | DB -> Sheet |
| `/api/review/import-merge` | POST | `spreadsheetId?`, `tab?` | Sheet `m_` 값 -> DB 병합 |
| `/api/review/import-csv` | POST | CSV | review target seed import |
| `/api/review/write-sheet/append` | POST | `writeTab`, `headers`, `values` | Write Tab 마지막 행 append |
