> 이 파일이 답하려는 질문: URL이 들어왔을 때부터 화면에 행이 그려질 때까지 무슨 일이 벌어지는가?

# 데이터 흐름 (Data Flow)

## 목적

`/filtered` 페이지의 전체 데이터 파이프라인을 한 문서에서 추적할 수 있게 한다. 서버에서 CSV를 읽어 DB와 조합하고, 클라이언트에서 필터·정렬을 거쳐 `EntryRow`가 그려지기까지의 모든 단계를 다룬다. 차트 모달 이후 흐름은 [chart-modal.md](./chart-modal.md)에서 이어진다.

---

## 흐름

### 1. 서버 진입 — 덱 로드

1. 사용자가 `/filtered?dir=2026-04`로 접속한다.
2. `app/(main)/filtered/page.tsx`(서버 컴포넌트)가 실행되어 `loadDeckAction("2026-04")`를 호출한다.
3. 액션 내부 순서:
   - `resolveDeckSubDir("2026-04")` → `DECKS_DIR + "/2026-04"` 절대 경로 생성
   - `loadDecksFromDir(absDir)` → 디렉터리 내 모든 `.csv` 파일 `Papa.parse` + 중복 제거(`dedupeEntries`) → `LoadedDecks` 반환
4. `dto.entries`가 비어있으면 빈 결과를 즉시 `okResult`로 반환한다.

### 2. DB 조회 — 테마 스냅샷 수집

5. `entries` 각각에 대해 `getThemeSnapshotAt(db, { stockCode, tradeDate, tradeTime })`를 호출한다.
   - 반환값: 해당 종목이 속한 테마별 `ThemeSnapshotMember[]` 배열
6. 반환된 스냅샷에서 `isSelf = true`인 멤버를 찾아 `toStockMetricsDTO(selfMember, STAT_AMOUNTS)` 호출 → `StockMetricsDTO` 생성 (`bigint` → `string` 변환 포함).

### 3. 행 조립 — ThemeRowData 생성

7. 한 entry가 여러 테마에 속하면 테마마다 행이 하나씩 생성된다.
8. 각 행에서:
   - 테마 내 모든 멤버(self + peers)를 등락률 내림차순으로 정렬 → `selfRank` 계산
   - peers DTO 목록을 `peers` 필드에 할당
   - `themeId`, `themeName`, `themeSize` 할당
9. 결과를 `ThemeRowData[]`로 조립해 `okResult({ data: dto, rows })`를 반환한다.

### 4. 클라이언트 진입 — FilteredClient

10. `FilteredClient`(클라이언트 컴포넌트)가 `initialResult`를 prop으로 받아 마운트된다.
11. `useFilterState`가 nuqs로 현재 URL 쿼리스트링을 읽어 `filterValues`, `optionFilters`, `activeChips`를 계산한다.
    - 각 필터 정의의 `fromUrl(params)`가 호출되어 정규화된 값 반환
    - `opt` 파라미터는 `deserializeOptionFilter`로 파싱

### 5. 필터 + 정렬

12. `applyFilters(rows, filterValues, optionFilters)`:
    - `FILTERS` 배열의 각 정의에 대해 `match(row, value)` 실행
    - `optionFilters`를 별도 루프에서 `matchOption(row, filter)` 실행
    - 두 조건 모두 통과한 행만 남긴다
13. `sortRows(filtered, sortKey, sortDir)` → 표시 순서 결정

### 6. 렌더 — EntryRow

14. `EntryListHeader` + `EntryRow` 렌더.
    - 컬럼 정의는 `columns/definitions.tsx`에서, 그리드 템플릿은 `lib/columns/gridTemplate.ts`에서 결정
    - `useUiStore.visibleOptionKeys`와 결합해 옵션 컬럼 표시 여부 제어
15. 사용자가 종목 버튼 클릭 → `useChartModalStore.open(target)` → ChartModal 흐름은 [chart-modal.md](./chart-modal.md)로 위임.

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|-------------|
| `src/app/(main)/filtered/page.tsx` | 서버 컴포넌트 진입점 | `FilteredPage` |
| `src/actions/deck.ts` | 덱 로드 + DB 조회 서버 액션 | `loadDeckAction` |
| `src/deck/loader.ts` | CSV 파싱 + 중복 제거 | `loadDecksFromDir` |
| `src/deck/config.ts` | 경로 해석 | `resolveDeckSubDir`, `resolveDecksBaseDir` |
| `src/lib/snapshotMapper.ts` | raw DB row → DTO 변환 | `toStockMetricsDTO` |
| `src/app/(main)/filtered/FilteredClient.tsx` | 클라이언트 최상위 | `FilteredClient` |
| `src/hooks/useFilterState.ts` | URL ↔ 필터 값 동기화 | `useFilterState` |
| `src/lib/filter/applyFilters.ts` | 전체 행 필터 실행 | `applyFilters` |
| `src/lib/sort/sortRows.ts` | 정렬 | `sortRows` |
| `src/components/list/EntryRow.tsx` | 행 렌더 | `EntryRow` |
| `src/lib/filter/registry/index.ts` | 필터 정의 목록 | `FILTERS` |
| `src/lib/result.ts` | 성공/실패 래퍼 | `Result<T>`, `okResult`, `errResult` |

---

## 설계 결정

- **서버 액션 결과를 `Result<T>`로 감싸는 이유** — Next.js 기본 동작은 서버 액션에서 throw 시 에러 페이지를 노출한다. 클라이언트에서 `if (!res.ok)` 단일 분기로 에러를 처리하기 위해 합성 타입을 도입했다. → [ADR-005](../decisions/005-result-type.md)

- **`bigint`를 `string`으로 직렬화하는 이유** — 서버 액션 반환값은 JSON 직렬화되며, JSON은 `bigint`를 지원하지 않는다. `Number()`는 정밀도 손실 위험이 있어 `string`을 선택했다. → [ADR-006](../decisions/006-bigint-serialization.md)

- **옵션 필터를 정적 레지스트리에서 분리한 이유** — CSV마다 컬럼명이 달라 컴파일 타임에 정의할 수 없다. → [ADR-008](../decisions/008-option-filter-separation.md)

---

## 확장 포인트

- **페이지네이션 추가** — `src/lib/constants.ts`의 `LIST_PAGE_SIZE` 상수를 기준으로 `FilteredClient`의 렌더 루프에 슬라이싱 로직 추가.
- **새 데이터 소스(예: API)** — `loadDeckAction` 내부에서 `dir` 파라미터를 분기하거나 별도 액션을 추가. `deck/loader.ts`는 파일시스템 전용이므로 새 로더를 별도 파일로 만드는 것이 권장.
- **행 단위 캐싱** — 현재 서버 액션 호출은 캐시 없이 매 요청마다 실행. `QueryProvider`의 staleTime 정책 또는 Next.js `cache()` 래퍼 적용으로 개선 가능.
