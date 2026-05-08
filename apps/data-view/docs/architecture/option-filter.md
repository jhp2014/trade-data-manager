> 이 파일이 답하려는 질문: 왜 옵션 필터는 정적 필터 레지스트리 밖에 있는가?

# 옵션 필터 (Option Filter)

## 목적

CSV마다 컬럼이 다른 옵션 필터를 정적 필터 레지스트리와 분리해 처리하는 이유와 구체적인 동작 방식을 설명한다. 정적 필터의 공통 흐름은 [filter-system.md](./filter-system.md)를 참조한다.

---

## 흐름

### 1. optionKeys 수집

CSV 헤더에서 필수 3컬럼(`stockCode`, `tradeDate`, `tradeTime`) 이외의 나머지 컬럼 이름이 `optionKeys`로 분류된다. 파일마다 다를 수 있으며, 덱이 로드될 때마다 결정된다.

### 2. OptionMeta 생성 — `buildOptionRegistry`

```
buildOptionRegistry(entries, optionKeys):
    for each key in optionKeys:
        distinct = entries의 해당 key 값을 parseOptionValue로 토크나이즈한 distinct 집합
        isMultiToken = 파이프(|) 구분자가 있으면 true
        defaultMode = distinct.size <= 20 → "anyOf", 초과 → "contains"
        → OptionMeta { key, values, defaultMode, isMultiToken }
```

`ANY_OF_MAX_DISTINCT = 20` 기준으로 자동 모드 결정: 값 종류가 적으면 체크박스형 `anyOf`, 많으면 텍스트 검색형 `contains`.

### 3. 직렬화 — URL `opt` 파라미터

옵션 필터는 `opt` URL 파라미터에 직렬화 문자열 배열로 저장된다:

| 모드 | 직렬화 형식 | 예시 |
|------|------------|------|
| `anyOf` | `any:{key}:{v1}\|{v2}` | `any:sector:IT\|반도체` |
| `contains` | `has:{key}:{needle}` | `has:theme:2차전지` |

`serializeOptionFilter` / `deserializeOptionFilter`가 이 변환을 담당한다.

### 4. 매칭 — `matchOption`

`applyFilters`에서 정적 필터 루프와 별도로 옵션 필터 루프를 실행한다:

```
for each optFilter in optionFilters:
    row.entry.options[optFilter.key] 값을 파싱해 매칭 여부 확인
    - anyOf: parseOptionValue(raw)에서 values 중 하나라도 포함되면 true
    - contains: 원시 문자열에서 needle의 대소문자 무시 포함 여부
```

### 5. UI — 동적 생성

`OptionRow.tsx`가 `OptionMeta`를 받아 모드에 따라 체크박스(anyOf) 또는 텍스트 입력(contains) UI를 렌더한다. 옵션 컬럼 가시성은 `OptionVisibilityPicker.tsx`로 제어한다.

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|-------------|
| `src/lib/options/optionRegistry.ts` | OptionMeta 생성 | `buildOptionRegistry`, `OptionMeta` |
| `src/lib/options/parseOptionValue.ts` | 파이프 구분 값 파싱 | `parseOptionValue` |
| `src/lib/options/serializeOptionFilter.ts` | URL 직렬화/역직렬화 | `serializeOptionFilter`, `deserializeOptionFilter` |
| `src/lib/filter/matchers/option.ts` | 매칭 로직 | `matchOption` |
| `src/components/filter/inputs/OptionRow.tsx` | 동적 옵션 입력 UI | `OptionRow` |
| `src/components/list/OptionsCell.tsx` | 리스트 셀에서 옵션 값 표시 | `OptionsCell` |
| `src/components/list/OptionVisibilityPicker.tsx` | 옵션 컬럼 가시성 선택 | `OptionVisibilityPicker` |

---

## 설계 결정

- **정적 레지스트리에서 분리한 이유** — 옵션 키는 CSV별로 달라 컴파일 타임에 타입·UI를 정의할 수 없다. `FilterDefinition` 인터페이스를 구현하려면 `Input` 컴포넌트와 `fromUrl/toUrl`을 정적으로 선언해야 하는데, 동적 키에는 적합하지 않다. 별도 흐름(`opt` 파라미터 + 별도 매칭 루프)을 유지하는 것이 더 단순하다. → [ADR-008](../decisions/008-option-filter-separation.md)

---

## 확장 포인트

- **새 파싱 규칙 추가** (예: `;` 구분자 지원) — `src/lib/options/parseOptionValue.ts`만 수정.
- **직렬화 포맷 변경** — `serializeOptionFilter.ts`와 `deserializeOptionFilter` 두 함수를 동시에 변경. 기존 URL 북마크가 파손될 수 있으므로 마이그레이션 필요.
- **새 매칭 모드 추가** (예: `regex`) — `matchOption` 확장 + `OptionFilter` 유니온 타입 확장 + `serializeOptionFilter` 포맷 추가.
