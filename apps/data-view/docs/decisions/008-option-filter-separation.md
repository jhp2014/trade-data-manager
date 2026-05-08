# ADR-008: Option Filter를 정적 레지스트리에서 분리

## 상태

Accepted (2026-05-08)

## 맥락

ADR-001에서 도입한 Filter Registry는 모든 필터가 컴파일 타임에 알려진 정적 구조를 전제로 한다. 그런데 옵션 필터는 CSV 파일의 헤더에서 동적으로 결정되는 컬럼 이름을 키로 사용한다. CSV마다 옵션 컬럼 구성이 다르며, 새 CSV가 추가될 때마다 코드 변경 없이 새 컬럼을 지원해야 한다.

## 검토한 대안

- **A: FILTERS 배열에 동적 주입** — 런타임에 덱 로드 후 동적으로 `FilterDefinition` 객체를 생성해 `FILTERS`에 추가. 기각: `FILTERS`가 싱글턴 배열이라 React 상태 사이클과 분리되어 있어, 동적 갱신이 복잡하고 예측 불가능한 부작용이 생긴다.
- **B: 별도 매칭·직렬화 경로 유지 (채택)** — `opt` URL 파라미터에 직렬화 문자열로 저장, `deserializeOptionFilter`로 파싱, `matchOption`으로 별도 매칭. 정적 필터와 완전히 분리된 흐름.
- **C: 옵션 키 화이트리스트 강제** — 허용 옵션 키를 코드에 사전 등록. 기각: 새 CSV 추가 시 항상 코드를 수정해야 하므로 동적 지원의 의미가 없다.

## 결정

**B안** 채택. 옵션 필터는 `FILTERS` 배열과 완전히 독립적인 흐름(`opt` 파라미터 → `deserializeOptionFilter` → `matchOption`)으로 처리한다. `useFilterState`에서도 `filterValues`(정적 필터)와 `optionFilters`(동적 필터)가 별도 상태로 관리된다.

## 결과

- **장점**: 정적 필터 타입(`FilterDefinition`)이 깔끔하게 유지된다. 새 CSV 추가 시 코드 변경 없이 새 옵션 컬럼 자동 지원.
- **단점/한계**: 옵션 필터와 정적 필터 두 흐름을 모두 이해해야 전체 필터 시스템을 파악할 수 있다. 이를 보완하기 위해 [architecture/option-filter.md](../architecture/option-filter.md)를 별도 문서로 작성했다.

## 관련

- 코드: `src/lib/options/`, `src/lib/filter/matchers/option.ts`, `src/hooks/useFilterState.ts`
- 기능 문서: [`docs/architecture/option-filter.md`](../architecture/option-filter.md)
- 선행 ADR: [ADR-001](./001-filter-registry.md)
- 후속 ADR: 없음
