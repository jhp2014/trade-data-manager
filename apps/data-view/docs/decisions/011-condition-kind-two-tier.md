# ADR-011: ConditionKind 2단 레지스트리

## 상태

Accepted (2026-05-09)

## 맥락

`activeMembersInTheme` 필터는 "테마 내 종목 중 일정 조건을 만족하는 종목이 N개 이상 존재하면 행을 포함한다"는 필터다. 이 조건("rate ≥ 5%, cumAmount ≥ 100억") 자체가 사용자가 설정하는 값이며, 동일한 조건 평가 로직을 세 곳에서 재사용해야 했다.

1. **행 필터링** (`activeMembersInTheme.match`): 테마 peers 중 조건 통과 종목 수 계산
2. **EntryRow 패널**: Act#N 칩 클릭 시 같은 조건으로 통과한 종목 목록 표시
3. **차트 오버레이** (`RealThemeOverlayChart`): 동일 조건으로 오버레이 시리즈 가시성 토글

조건 평가(`eval`)와 조건을 입력받는 UI(`Input`)를 FilterKind 안에 인라인으로 넣으면 세 곳 모두에서 복사·붙여넣기가 필요하다.

## 검토한 대안

- **A: FilterKind 내 인라인** — `activeMembersInTheme.tsx` 안에 조건 평가 로직과 UI를 직접 구현. 기각: 조건 종류(rate, cumAmount …)가 늘어날수록 단일 파일이 비대해지고, 재사용이 불가능하다.
- **B: ConditionKind + MemberPredicate (채택)** — 조건 단위를 `ConditionKind<TValue>`로 분리해 별도 레지스트리(`CONDITION_KINDS`)에 등록. `MemberPredicate`는 `Condition[]`의 AND 조합. `FilterKind`는 `MemberPredicate`를 value로 가지며, 평가는 `isMember(stockMetrics, predicate)`로 위임한다.
- **C: 공유 훅/함수** — 평가 함수만 공유하고 UI는 각자 구현. 기각: UI 중복이 그대로 남는다.

## 결정

**B안** 채택. 2단 레지스트리 구조:

```
ConditionKind<TValue>          FilterKind<TValue>
  kind / label                   kind / label / section / multiple
  defaultValue()                 defaultValue(ctx) 
  eval(m: StockMetricsDTO, v)    match(row, v, derived, instanceId)
  chipFragment(v)                chipLabel(v, ctx)
  Input                          Input (uses ConditionInputDispatcher)
  serialize / deserialize        serialize / deserialize
```

- `CONDITION_KINDS` 레지스트리: `rate`, `cumAmount`, `amountHits`, `pullback`, `dayHigh`, `minutesSinceHigh`
- `MemberPredicate = { name?: string; conditions: Condition[] }`. `isMember(m, p)` = `p.conditions.every(c => evalCondition(m, c))`
- 직렬화: `Condition` = `"kind:payload"`, `MemberPredicate` = 조건들을 `";"` 로 join
- `PredicateInput` 컴포넌트가 조건 칩 목록을 표시하고 `ConditionInputDispatcher`로 개별 조건 편집 UI를 렌더한다

## 결과

- **장점**: 새 조건 추가 시 `ConditionKind` 파일 1개 + `CONDITION_KINDS` 1줄. 평가 로직 단일 경로. 차트/리스트/필터 세 곳이 같은 `isMember`를 사용.
- **단점/한계**: 차트 오버레이에서는 `StockMetricsDTO`의 모든 필드를 차트 데이터만으로 채울 수 없어 `amountDistribution` 등 일부 조건이 정확히 동작하지 않는다(→ ADR-012). 조건 레지스트리와 필터 레지스트리 두 곳을 등록해야 하므로, 처음 기여하는 개발자에게 진입 경로가 두 갈래다.

## 관련

- 코드: `src/lib/condition/`, `src/lib/member/predicate.ts`, `src/components/filter/inputs/PredicateInput.tsx`
- 선행 ADR: [ADR-010](./010-unified-filter-instance-model.md)
- 기능 문서: [`docs/architecture/member-predicate.md`](../architecture/member-predicate.md)
