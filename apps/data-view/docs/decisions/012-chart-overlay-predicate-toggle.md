# ADR-012: 차트 오버레이 Active Predicate 토글

## 상태

Accepted (2026-05-09)

## 맥락

테마 오버레이 차트는 테마 전체 종목의 등락률 시계열을 겹쳐 그린다. `activeMembersInTheme` 필터 인스턴스가 활성화된 경우, "Act#1 조건을 통과한 종목만 강조"하는 토글 UI를 추가해야 했다.

두 가지 구현 방법을 고려했다.

1. **리스트에서 미리 계산한 stockCode 집합 전달**: `FilteredClient`의 `derivedMap`에는 이미 각 행의 `activePools[].members`(StockMetricsDTO[])가 있다. 차트 열기 시 해당 행의 멤버 코드를 스토어에 실어 보낼 수 있다.
2. **차트 컴포넌트가 predicate를 받아 직접 평가**: `ChartModal`이 `useFilterState()`로 `activeMembersInTheme` 인스턴스를 읽고, `RealThemeOverlayChart`에 predicate를 전달. 차트는 오버레이 시리즈의 마지막 데이터 포인트로 `StockMetricsDTO`를 부분 구성해 `isMember`를 호출한다.

## 검토한 대안

- **A: stockCode 집합 전달** — 정확하다. 그러나 `useChartModalStore`에 `activePools` 데이터를 추가해야 하고, 여러 테마에 속한 종목을 클릭했을 때 어느 테마 기준의 풀을 전달할지 모호해진다.
- **B: predicate 전달 후 차트에서 평가 (채택)** — 스토어 구조 변경이 없고, 언제든 필터 인스턴스가 바뀌면 자동으로 반영된다. 평가 코드가 `isMember`로 공유된다.

## 결정

**B안** 채택. 단, 차트 데이터(`ChartOverlayPoint`)로 재구성 가능한 필드는 `closeRate`(마지막 `value`)와 `cumulativeAmount`(마지막 `cumAmount`) 두 가지뿐이다. `amountDistribution`, `dayHighRate`, `pullbackFromHigh`, `minutesSinceDayHigh`는 null로 설정된다.

알려진 한계: 이 null 필드에 의존하는 조건(amountHits, dayHigh, pullback, minutesSinceHigh)을 포함한 predicate는 차트 오버레이에서 해당 조건을 항상 "불통과"로 판정한다. 이는 UI가 리스트 뷰 결과와 다를 수 있음을 의미하지만, 가장 흔한 조건(rate, cumAmount)은 정확히 동작하므로 실용적으로 허용 가능하다.

기타 설계:
- `selectedFilter` 상태는 차트 로컬 state(`useState`)로만 관리. `useUiStore`에 영속화하지 않는다.
- 시리즈 자체를 제거하지 않고 `applyOptions({ visible: bool })`로 가시성만 조작해 재생성 비용을 줄인다.
- self 시리즈는 선택 필터와 무관하게 항상 표시한다.
- `activePredicateInstances`가 바뀌어 현재 선택 id가 사라지면 "전체" 토글로 자동 리셋한다.

## 결과

- **장점**: 스토어 구조 불변. 필터 변경 시 토글이 자동 갱신됨. 구현 간결.
- **단점/한계**: amountHits 등 일부 조건은 차트 데이터로 평가할 수 없어 리스트 뷰와 불일치가 발생할 수 있다. 이 한계는 사용자가 rate·cumAmount 위주로 조건을 구성하는 통상적인 사용 패턴에서 문제가 되지 않는다.

## 관련

- 코드: `src/components/chart/RealThemeOverlayChart.tsx`, `src/components/chart/ChartModal.tsx`
- 선행 ADR: [ADR-011](./011-condition-kind-two-tier.md)
