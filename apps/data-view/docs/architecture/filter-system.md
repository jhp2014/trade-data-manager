> 이 파일이 답하려는 질문: 필터 인스턴스가 URL과 매칭 함수, 파생 데이터와 어떻게 동기화되는가?

# 필터 시스템 (Filter System)

## 목적

필터 인스턴스를 URL에 직렬화하고, 런타임에 역직렬화해 행 필터링과 파생 데이터 계산을 수행하는 전체 흐름을 설명한다. 멤버 조건(MemberPredicate / ConditionKind)은 [member-predicate.md](./member-predicate.md)를 참조한다.

---

## 핵심 개념

### FilterInstance
```ts
{ id: string; kind: string; value: unknown }
```
`id`는 8자 base36 랜덤 문자열. 동일 `kind`를 여러 개 동시에 사용할 수 있다.

### FilterKind\<TValue\>
필터 종류 하나의 동작을 기술하는 인터페이스. `KINDS` 레지스트리에 등록된다.

| 필드/메서드 | 설명 |
|------------|------|
| `kind` | 식별자 문자열 |
| `multiple` | 복수 인스턴스 허용 여부 |
| `defaultValue(ctx)` | 초기값 생성 |
| `chipLabel(v, ctx)` | 활성 칩 라벨 |
| `match(row, v, derived, instanceId)` | 행이 조건을 만족하면 true |
| `Input` | 패널 입력 UI 컴포넌트 |
| `serialize / deserialize` | payload 문자열 변환 |

현재 등록된 `KINDS`: `targetMember`, `activeMembersInTheme`, `targetActiveRank`, `stockCode`, `dateRange`, `timeRange`, `option`

### RowDerived
행별 파생 데이터. `activePools: ActivePool[]`을 포함하며, `computeRowDerived`가 필터 적용 전 전체 행에 대해 미리 계산한다.

---

## URL 형식

```
?f=<id>:<kind>:<payload>[&f=…]
```

nuqs `parseAsArrayOf(parseAsString)`. 첫 번째·두 번째 콜론에서만 분리하므로 payload 내부에 콜론이 포함될 수 있다.

예시:
```
?f=ab12cd34:targetMember:rate:5..30;cumAmount:100
&f=ef56gh78:activeMembersInTheme:rate:5..;cumAmount:50|2
&f=ij90kl12:targetActiveRank:ef56gh78;1..3
```

---

## 데이터 흐름

```
URL (?f=[…])
  │
  ▼  useFilterState()
  │  1. 1차 파싱: id/kind만 추출 → partialInstances (ctx 구성용)
  │  2. 2차 파싱: kind.deserialize(payload, ctx) → FilterInstance[]
  │
  ├─▶ instances (FilterInstance[])
  │
  │   FilteredClient.tsx
  │
  ├─▶ activeMemberInstances = instances.filter(kind === "activeMembersInTheme")
  │
  ├─▶ computeRowDerived(allRows, activeMemberInstances)
  │   → derivedMap: Map<rowKey, RowDerived>
  │   → 각 activeMembersInTheme 인스턴스에 대해 peers 전체를 isMember로 평가
  │   → { instanceId, selfRank, poolSize, members[] }  = ActivePool
  │
  ├─▶ applyFiltersNew(allRows, instances, derivedMap, KINDS)
  │   → KINDS[inst.kind].match(row, inst.value, derived, inst.id)
  │
  └─▶ sortRows(filteredRows) → 화면 렌더
```

---

## FilterPanel 섹션 구조

| 섹션 | 포함 FilterKind | multiple |
|------|----------------|---------|
| 기본 필터 | `stockCode`, `dateRange`, `timeRange` | false |
| Target 종목 조건 | `targetMember` | false (자동 생성) |
| Active 멤버 슬롯 | `activeMembersInTheme` | **true** |
| Target 활성 등수 | `targetActiveRank` | **true** |
| 옵션 | `option` | **true** |

`targetMember`는 FilterPanel 마운트 시 인스턴스가 없으면 자동으로 1개 생성된다.

---

## EntryRow 동작

`activePools`가 없으면 기존 `rankBtn`(#테마 펼치기) 표시. 있으면 Act#N 칩 목록으로 대체.

- **Space** (hover 중) → 차트 모달 열기
- **1/2/3…** (hover 중, activePools 없음) → 1 = theme 펼치기
- **1/2/3…** (hover 중, activePools 있음) → 해당 Act#N 풀 펼치기

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/lib/filter/kinds/types.ts` | `FilterKind`, `FilterInstance`, `BuildCtx`, `RowDerived`, `ActivePool` |
| `src/lib/filter/kinds/index.ts` | `KINDS` 레지스트리 |
| `src/lib/filter/kinds/*.tsx` | 개별 FilterKind 구현 |
| `src/lib/filter/id.ts` | `newInstanceId()` |
| `src/lib/filter/url.ts` | `serializeInstance`, `deserializeInstance` |
| `src/lib/filter/derived.ts` | `computeRowDerived`, `rowKey` |
| `src/lib/filter/applyFiltersNew.ts` | `applyFiltersNew` |
| `src/hooks/useFilterState.ts` | URL ↔ 상태 동기화 |
| `src/components/filter/FilterPanel.tsx` | 필터 입력 UI |
| `src/components/filter/FilterChipBar.tsx` | 활성 칩 표시 |
| `src/components/list/EntryRow.tsx` | Act#N 칩, 펼침 패널 |

---

## 설계 결정

- **단일 `f` 배열 파라미터** — 파라미터 종류 무관하게 직렬화 형식을 통일. → [ADR-010](../decisions/010-unified-filter-instance-model.md)
- **ConditionKind 2단 레지스트리** — 멤버 조건 평가 로직을 FilterKind와 분리. → [ADR-011](../decisions/011-condition-kind-two-tier.md)
- **computeRowDerived가 전체 행에 실행되는 이유** — 필터에서 제외된 행도 EntryRow를 통해 Act#N 칩을 표시해야 하기 때문이 아니라, `filteredSortedRows`를 결정하기 전에 derived가 필요하기 때문이다. 필터된 결과에만 계산하면 닭-달걀 순환이 생긴다.
