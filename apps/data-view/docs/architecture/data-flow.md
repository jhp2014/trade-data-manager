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
11. `useFilterState(optionKeys, optionRegistry)`가 nuqs `?f=` 배열 파라미터를 읽어 `FilterInstance[]`를 계산한다.
    - 1차 파싱: `id:kind` 만 추출해 `BuildCtx`를 구성 (역참조 지원)
    - 2차 파싱: `KINDS[kind].deserialize(payload, ctx)` 로 `value` 복원
    - `activeMembersInTheme` 인스턴스를 추려 `activeMemberInstances` 분리

### 5. 파생 데이터 계산 + 필터 + 정렬

12. `computeRowDerived(allRows, activeMemberInstances)`:
    - 전체 행(`allRows`)에 대해 각 `activeMembersInTheme` 인스턴스별로 `isMember(peer, predicate)`를 실행
    - 결과: `derivedMap: Map<rowKey, RowDerived>`, 각 항목에 `activePools: ActivePool[]` 포함
    - **전체 행에 실행하는 이유**: `applyFilters` 실행 전에 파생 데이터가 필요하므로(닭-달걀 순환 방지)
13. `applyFilters(allRows, instances, derivedMap, KINDS)`:
    - 각 `FilterInstance`에 대해 `KINDS[inst.kind].match(row, inst.value, derived, inst.id)` 실행
    - 전체 인스턴스를 통과한 행만 남긴다
14. `sortRows(filtered)` → 표시 순서 결정

### 6. 렌더 — EntryRow

15. `EntryListHeader` + `EntryRow` 렌더.
    - 컬럼 정의는 `columns/definitions.tsx`에서, 그리드 템플릿은 `lib/columns/gridTemplate.ts`에서 결정
    - `useUiStore.visibleOptionKeys`와 결합해 옵션 컬럼 표시 여부 제어
16. `activePools`가 1개 이상이면 `EntryRow`에 Act#N 칩이 표시된다. 클릭 시 해당 풀의 종목 목록 펼침.
17. 사용자가 종목 버튼 클릭(또는 hover 중 Space) → `useChartModalStore.open(target)` → ChartModal 흐름은 [chart-modal.md](./chart-modal.md)로 위임.

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
| `src/hooks/useFilterState.ts` | URL ↔ 인스턴스 동기화 | `useFilterState` |
| `src/lib/filter/kinds/index.ts` | 필터 종류 레지스트리 | `KINDS` |
| `src/lib/filter/derived.ts` | 파생 데이터 계산 | `computeRowDerived`, `rowKey` |
| `src/lib/filter/applyFilters.ts` | 전체 행 필터 실행 | `applyFilters` |
| `src/lib/sort/sortRows.ts` | 정렬 | `sortRows` |
| `src/components/list/EntryRow.tsx` | 행 렌더 (Act#N 칩 포함) | `EntryRow` |
| `src/lib/result.ts` | 성공/실패 래퍼 | `Result<T>`, `okResult`, `errResult` |

---

## 설계 결정

- **서버 액션 결과를 `Result<T>`로 감싸는 이유** — Next.js 기본 동작은 서버 액션에서 throw 시 에러 페이지를 노출한다. 클라이언트에서 `if (!res.ok)` 단일 분기로 에러를 처리하기 위해 합성 타입을 도입했다. → [ADR-005](../decisions/005-result-type.md)

- **`bigint`를 `string`으로 직렬화하는 이유** — 서버 액션 반환값은 JSON 직렬화되며, JSON은 `bigint`를 지원하지 않는다. `Number()`는 정밀도 손실 위험이 있어 `string`을 선택했다. → [ADR-006](../decisions/006-bigint-serialization.md)

- **단일 `?f=` 배열 파라미터로 모든 필터를 직렬화하는 이유** — 복수 인스턴스 지원 및 파라미터 키 관리 파일 제거. → [ADR-010](../decisions/010-unified-filter-instance-model.md)

---

## 확장 포인트

- **페이지네이션 추가** — `src/lib/constants.ts`의 `LIST_PAGE_SIZE` 상수를 기준으로 `FilteredClient`의 렌더 루프에 슬라이싱 로직 추가.
- **새 데이터 소스(예: API)** — `loadDeckAction` 내부에서 `dir` 파라미터를 분기하거나 별도 액션을 추가. `deck/loader.ts`는 파일시스템 전용이므로 새 로더를 별도 파일로 만드는 것이 권장.
- **행 단위 캐싱** — 현재 서버 액션 호출은 캐시 없이 매 요청마다 실행. `QueryProvider`의 staleTime 정책 또는 Next.js `cache()` 래퍼 적용으로 개선 가능.
