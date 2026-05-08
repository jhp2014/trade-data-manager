> 이 파일이 답하려는 질문: 필터 칩이 URL과 매칭 함수와 어떻게 동기화되는가?

# 필터 시스템 (Filter System)

## 목적

필터 정의 1개를 추가했을 때 URL 파라미터 파싱, 칩바 표시, 패널 입력 UI, 행 매칭이 자동으로 반영되는 메커니즘을 설명한다. 옵션 필터처럼 정적 정의가 불가능한 특수 케이스는 [option-filter.md](./option-filter.md)를 참조한다.

---

## 흐름

### 1. 단일 진실의 원천 — `FILTERS` 배열

`src/lib/filter/registry/index.ts`의 `FILTERS: AnyFilterDef[]` 배열이 모든 필터의 정의를 담는다. 배열 순서가 `FilterPanel`의 표시 순서와 일치한다.

```
FILTERS = [
    themeSizeFilter,       // section: "theme"
    themeMemberSlotFilter, // section: "theme"
    stockCodeFilter,       // section: "target"
    dateRangeFilter,       // section: "target"
    timeRangeFilter,       // section: "target"
    closeRateFilter,       // section: "target"
    rankFilter,            // section: "target"
    pullbackFilter,        // section: "target"
    minutesSinceHighFilter // section: "target"
]
```

### 2. FilterDefinition — 필터 1개의 구조

각 정의는 `FilterDefinition<TValue>` 인터페이스를 구현한다:

| 메서드/필드 | 설명 |
|------------|------|
| `id` | 필터 고유 식별자. `filterValues` 맵의 키로 사용 |
| `section` | `"theme"` 또는 `"target"`. 패널 섹션 그룹 결정 |
| `defaultValue` | 비활성(빈) 상태의 기본값 |
| `fromUrl(params)` | URL 쿼리스트링 → 필터 값 역직렬화 |
| `toUrl(value)` | 필터 값 → URL 쿼리스트링 패치 |
| `chips(value)` | 활성 상태면 `FilterChip[]` 반환, 비활성이면 `[]` |
| `clearChip(chipId, current)` | 특정 칩 제거 후 새 값 반환 |
| `match(row, value)` | `ThemeRowData` 행이 조건을 만족하면 `true` |
| `Input` | 패널에 렌더되는 입력 UI 컴포넌트 |

### 3. URL ↔ 상태 동기화 — `useFilterState`

`useFilterState`는 nuqs의 `useQueryStates`로 URL 쿼리스트링을 구독한다.

```
URL 변경 → useQueryStates → params
           → FILTERS.map(f => f.fromUrl(params)) → filterValues
           → params.opt.map(deserializeOptionFilter)  → optionFilters
```

`filterValues`는 `Record<filterId, value>` 형태. 각 필터 정의가 자신의 URL 파라미터 키만 읽어 값을 도출한다.

### 4. 패널 입력 → URL 갱신

```
사용자 입력 → onChange(newValue)
           → setFilterValue(filterId, newValue)
           → f.toUrl(newValue) → Partial<FilterUrlParams>
           → setParams(patch)   → nuqs가 URL 갱신
           → URL 변경이 useQueryStates 재실행
```

URL은 `history: "replace"`로 관리되어 브라우저 히스토리를 오염시키지 않는다.

### 5. 행 필터링 — `applyFilters`

```
applyFilters(rows, filterValues, optionFilters):
    for each row:
        for each f in FILTERS:
            if !f.match(row, filterValues[f.id]) → 제외
        for each optFilter in optionFilters:
            if !matchOption(row, optFilter) → 제외
    → 남은 행 반환
```

### 6. 칩바 — `activeChips`

```
activeChips = FILTERS.flatMap(f => f.chips(filterValues[f.id]))
            + optionFilters.map(f => { id: `opt:${serialized}`, label: chipLabel })
```

칩 클릭(삭제) 시 `clearOne(chipId)`:
- `chipId.startsWith("opt:")` → `opt` 파라미터에서 해당 직렬화 문자열 제거
- 아니면 FILTERS에서 해당 칩을 소유한 정의를 찾아 `clearChip` 호출 → `toUrl` → `setParams`

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|-------------|
| `src/lib/filter/registry/index.ts` | 필터 정의 배열 | `FILTERS`, `FilterDefinition`, `FilterChip` |
| `src/lib/filter/registry/types.ts` | 인터페이스 정의 | `FilterDefinition<TValue>`, `AnyFilterDef` |
| `src/lib/filter/registry/urlParams.ts` | URL 파라미터 키 타입 | `FilterUrlParams` |
| `src/lib/filter/registry/*.ts` | 각 필터 정의 파일 | 예: `themeSizeFilter` |
| `src/hooks/useFilterState.ts` | URL ↔ 상태 동기화 | `useFilterState` |
| `src/lib/filter/applyFilters.ts` | 전체 행 필터 실행 | `applyFilters` |
| `src/lib/filter/matchers/*.ts` | 개별 매칭 함수 | `matchThemeSize`, `matchOption` 등 |
| `src/components/filter/FilterPanel.tsx` | 필터 입력 UI | `FilterPanel` |
| `src/components/filter/FilterChipBar.tsx` | 활성 칩 표시 | `FilterChipBar` |

---

## 설계 결정

- **레지스트리 패턴 채택 이유** — 기존에는 필터 추가 시 7~8곳을 개별 수정해야 했다. `FilterDefinition` 객체 하나에 모든 책임을 집약함으로써 1파일 + `FILTERS` 배열 1줄 추가로 완결된다. → [ADR-001](../decisions/001-filter-registry.md)

- **URL 키를 짧은 약어로 쓰는 이유** — `tsMin`, `tmRateMin` 같은 약어는 URL 길이를 줄이고, 필터 설정이 담긴 URL을 공유·북마크할 때 가독성을 높인다.

---

## 확장 포인트

- **새 필터 추가 절차** — [adding-filter.md](../adding-filter.md)에 위임.
- **새 섹션(`section: "..."`) 추가 시 한계** — 현재 `FilterPanel`은 `theme`과 `target` 두 섹션만 하드코딩으로 그룹화한다. 세 번째 섹션을 추가하려면 `FilterPanel.tsx`의 그룹화 로직도 함께 수정해야 한다.
