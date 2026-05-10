> 이 파일이 답하려는 질문: MemberPredicate와 ConditionKind는 무엇이고, 어디에서 사용되는가?

# MemberPredicate & ConditionKind

## 목적

"테마 내 종목 중 일정 조건을 만족하는 종목이 N개 이상"이라는 조건을 표현하기 위한 도메인 모델을 설명한다. 이 모델은 필터, 리스트 펼침 패널, 차트 오버레이 토글의 세 곳에서 공유된다.

---

## 핵심 타입

### Condition
```ts
{ kind: string; value: unknown }
```
단일 조건 하나. `CONDITION_KINDS[kind].eval(stockMetrics, value)`로 평가한다.

### MemberPredicate
```ts
{ name?: string; conditions: Condition[] }
```
`Condition[]`의 AND 조합. `isMember(m, p) = p.conditions.every(c => evalCondition(m, c))`.

조건이 0개인 predicate는 모든 종목을 통과시킨다.

---

## ConditionKind\<TValue\>

조건 종류 하나의 평가·UI·직렬화를 묶은 정의 객체. `CONDITION_KINDS` 레지스트리에 등록된다.

| 필드 | 설명 |
|------|------|
| `kind` | 식별자 (`"rate"`, `"cumAmount"` …) |
| `label` | UI 표시 이름 |
| `defaultValue()` | 초기 값 |
| `chipFragment(v)` | 칩 텍스트 조각 (predicate 칩에서 `, `로 연결) |
| `eval(m: StockMetricsDTO, v)` | 조건 통과 여부 |
| `Input` | 조건 편집 UI |
| `serialize(v) / deserialize(raw)` | 문자열 변환 |

현재 등록된 조건 종류:

| kind | 설명 | 사용 필드 |
|------|------|----------|
| `rate` | 등락률 범위 (%) | `closeRate` |
| `cumAmount` | 누적 거래대금 하한 (억) | `cumulativeAmount` |
| `amountHits` | 특정 억원 이상 분봉 수 하한 | `amountDistribution` |
| `pullback` | 고점 대비 되돌림 범위 (%) | `pullbackFromHigh` |
| `dayHigh` | 당일 고가 등락률 범위 (%) | `dayHighRate` |
| `minutesSinceHigh` | 고점 경과 분 범위 | `minutesSinceDayHigh` |

---

## 직렬화

```
Condition    →  "<kind>:<payload>"
               예: "rate:5..30", "cumAmount:100", "amountHits:50:3"

MemberPredicate → Condition들을 ";"로 join
               예: "rate:5..30;cumAmount:100"
```

`MemberPredicate`는 `activeMembersInTheme` FilterKind의 payload 앞부분을 구성한다:
```
<predicateSerialized>|<countMin>
예: "rate:5..30;cumAmount:100|2"
```

---

## 사용 위치

### 1. computeRowDerived (행 필터링 전 파생 계산)
```ts
// src/lib/filter/derived.ts
for (const peer of row.peers) {
    if (isMember(peer, inst.predicate)) pool.push(peer);
}
```
각 `activeMembersInTheme` 인스턴스별로 `ActivePool { instanceId, selfRank, poolSize, members[] }`을 생성한다.

### 2. EntryRow (Act#N 칩 → 펼침 패널)
`derived.activePools`를 그대로 표시. 칩 라벨(`chipLabelForPredicate`)로 헤더 구성.

### 3. RealThemeOverlayChart (오버레이 토글)
`ChartModal`에서 `useFilterState()`로 읽은 인스턴스를 `activePredicateInstances`로 전달하되, 가시성 판정은 더 이상 `isMember`를 호출하지 않는다. 대신 `EntryRow`가 `open()` 시 동봉한 `target.activePools`(리스트의 `computeRowDerived` 결과)의 stockCode 집합을 그대로 사용해 시리즈 가시성을 토글한다. `predicate`는 Active 토글 버튼 hover 툴팁 표시에만 사용된다. → [ADR-012 Amendment](../decisions/012-chart-overlay-predicate-toggle.md)

---

## 새 조건 종류 추가 절차

1. `src/lib/condition/kinds/<newKind>.tsx` 생성 (`ConditionKind<TValue>` 구현)
2. `src/lib/condition/index.ts`의 `CONDITION_KINDS`에 등록

필터·EntryRow·차트는 `CONDITION_KINDS`를 간접 참조하므로 별도 수정 불필요.

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/lib/condition/types.ts` | `ConditionKind<TValue>`, `Condition` |
| `src/lib/condition/kinds/*.tsx` | 개별 ConditionKind 구현 |
| `src/lib/condition/index.ts` | `CONDITION_KINDS`, `evalCondition`, `serializeCondition`, `deserializeCondition` |
| `src/lib/member/predicate.ts` | `MemberPredicate`, `isMember`, `chipLabelForPredicate`, `serializePredicate`, `deserializePredicate` |
| `src/components/filter/inputs/PredicateInput.tsx` | 조건 칩 목록 + 추가 드롭다운 UI |
| `src/components/filter/inputs/ConditionInputDispatcher.tsx` | `CONDITION_KINDS[kind].Input`으로 분기 |
