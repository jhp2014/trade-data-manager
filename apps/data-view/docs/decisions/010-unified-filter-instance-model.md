# ADR-010: 통합 필터 인스턴스 모델

## 상태

Accepted (2026-05-09)

## 맥락

ADR-001에서 채택한 `FilterDefinition / FILTERS` 레지스트리 패턴은 정적 필터(1개 정의 = 1개 URL 파라미터)에 잘 맞았다. 그러나 두 가지 요구가 이 모델을 벗어났다.

1. **복수 인스턴스**: "Active 멤버 슬롯"은 동일한 종류의 필터를 여러 개 동시에 사용해야 한다(Act#1, Act#2 …). `FilterDefinition`은 인스턴스 개념이 없어 URL 키 충돌이 불가피했다.
2. **파생 데이터 의존**: `activeMembersInTheme` 필터는 `ThemeRowData.peers` 전체를 순회해 `ActivePool`을 계산한 결과를 사용해야 한다. `match(row, value)` 2-인자 서명으로는 이 파생 데이터를 전달할 방법이 없었다.

URL 파라미터도 문제였다. 기존 모델은 파라미터 키마다 nuqs 파서를 정의해야 해 새 필터 추가 시 `urlParams.ts`도 수정해야 했다.

## 검토한 대안

- **A: 기존 모델 확장** — `FilterDefinition`에 `multiple: true` 플래그를 추가하고 인스턴스를 배열로 관리. 기각: URL 키 관리가 복잡해지고, 파생 데이터 전달 문제가 해결되지 않는다.
- **B: 단일 `f` 배열 파라미터 + FilterInstance (채택)** — 모든 필터를 `id:kind:payload` 형태로 직렬화해 단일 `f[]` URL 파라미터에 담는다. 런타임에는 `FilterInstance { id, kind, value }` 배열로 관리하며, `match` 서명에 `(row, value, derived, instanceId)`를 추가해 파생 데이터를 전달한다.
- **C: 서버 상태 관리** — 필터 상태를 URL 밖(Zustand persist 등)으로 옮김. 기각: URL 공유·북마크 기능이 사라지고, SSR과 통합이 어려워진다.

## 결정

**B안** 채택. 구체적 설계:

- **URL 직렬화**: `?f=<id>:<kind>:<payload>` (nuqs `parseAsArrayOf(parseAsString)`). 첫 번째·두 번째 콜론에서만 분리하므로 payload 내부에 콜론이 포함될 수 있다.
- **FilterInstance**: `{ id: string; kind: string; value: unknown }`. `id`는 8자 base36 랜덤 문자열(`newInstanceId()`).
- **FilterKind\<TValue\>**: `kind / label / section / multiple / defaultValue / chipLabel / match / Input / serialize / deserialize`. `match(row, value, derived, instanceId)` — 4-인자 서명으로 파생 데이터와 자신의 instanceId를 받는다.
- **BuildCtx**: 역직렬화 시 필요한 컨텍스트. `optionKeys / optionRegistry / activeInstances`를 포함. `activeInstances`는 `targetActiveRank`의 `refInstanceId` 역참조에 사용된다.
- **RowDerived**: 행별 파생 데이터. `activePools: ActivePool[]`. `computeRowDerived(allRows, activeMemberInstances)`가 **필터 적용 전** 전체 행에 대해 계산한다.

## 결과

- **장점**: 동종 필터를 몇 개든 동시 운용 가능. 파생 데이터가 `match`에 자연스럽게 전달됨. URL 파라미터 정의 파일(`urlParams.ts`) 불필요.
- **단점/한계**: `applyFilters` 호출 전에 `computeRowDerived`를 먼저 실행해야 하는 의존 순서가 생긴다. 차트 오버레이에서 predicte를 재평가할 때 `amountDistribution` 등 일부 필드는 차트 데이터만으로 추론 불가능하다(→ ADR-012 참조).

## 관련

- 코드: `src/lib/filter/kinds/types.ts`, `src/hooks/useFilterState.ts`, `src/lib/filter/derived.ts`
- 선행 ADR: [ADR-001](./001-filter-registry.md)
- 후속 ADR: [ADR-011](./011-condition-kind-two-tier.md) (ConditionKind 분리), [ADR-012](./012-chart-overlay-predicate-toggle.md) (차트 토글)
