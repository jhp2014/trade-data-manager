# ADR-001: Filter Registry 패턴

## 상태

Accepted (2026-05-08)

## 맥락

필터 기능이 늘어나면서 새 필터를 추가할 때마다 수정해야 하는 파일이 7~8개에 달했다. URL 파라미터 파싱, 칩바 렌더, 패널 입력 UI, 매칭 함수, 칩 제거 로직이 각자 별도 파일에 흩어져 있었고, 하나라도 빠뜨리면 버그가 발생했다. 이러한 분산 구조는 유지보수 비용을 높이고 실수를 유발했다.

## 검토한 대안

- **A: 분산 유지** — 현재 구조를 그대로 두고 체크리스트로 관리. 추가 비용 없음. 기각: 실수 위험이 해소되지 않고, 파일 수가 늘수록 추적이 어려워진다.
- **B: 레지스트리 + 정의 객체 (채택)** — `FilterDefinition<TValue>` 인터페이스를 만들어 1개 파일에 `fromUrl / toUrl / chips / clearChip / match / Input` 6개 책임을 집약. `FILTERS` 배열에 1줄 추가하면 자동 반영.
- **C: 코드 생성기** — CLI로 보일러플레이트를 자동 생성. 기각: 빌드 파이프라인에 의존성이 추가되고, 간단한 레지스트리로 충분히 해결된다.

## 결정

**B안** 채택. `src/lib/filter/registry/types.ts`에 `FilterDefinition<TValue>` 인터페이스를 정의하고, 각 필터를 별도 파일로 구현한 뒤 `FILTERS` 배열(`registry/index.ts`)에 등록한다. `useFilterState`, `FilterPanel`, `FilterChipBar`, `applyFilters`는 모두 `FILTERS`를 직접 순회하므로 새 필터는 정의 파일 1개 + 배열 1줄 추가로 완결된다.

## 결과

- **장점**: 필터 추가 시 변경 파일 최소화. 타입 시스템이 6개 메서드 구현을 강제해 누락 방지. 배열 순서 = UI 표시 순서로 직관적.
- **단점/한계**: URL 파라미터 키(`tsMin`, `dFrom` 등)는 `urlParams.ts`에 별도로 등록해야 한다(타입 안전성을 위해). 새 섹션 추가 시 `FilterPanel`의 그룹화 로직도 수동으로 수정 필요.

## 관련

- 코드: `src/lib/filter/registry/`
- 기능 문서: [`docs/architecture/filter-system.md`](../architecture/filter-system.md)
- 실전 가이드: [`docs/adding-filter.md`](../adding-filter.md)
- 후속 ADR: [ADR-008](./008-option-filter-separation.md) (옵션 필터가 레지스트리 밖에 있는 이유)
