# 새 필터/조건 추가 가이드

## 의사결정 트리

```
추가하려는 것이 무엇인가?
│
├─ 개별 종목 수치를 평가하는 조건
│  (등락률, 거래대금, 분봉 수 …)
│  → ConditionKind 추가 (아래 A절)
│
├─ 테마 단위 새 필터
│  (예: "테마 크기 N개 이상", "진입 시각 범위")
│  → FilterKind 추가 (아래 B절)
│
└─ 여러 종목을 AND/OR 조합으로 거르는 조건?
   → activeMembersInTheme FilterKind에 ConditionKind를 추가해 해결
```

---

## A. ConditionKind 추가

ConditionKind는 `StockMetricsDTO` 한 개를 받아 통과 여부를 반환하는 평가 단위다.
`MemberPredicate`의 구성 요소로, `activeMembersInTheme` 슬롯·EntryRow 패널·차트 오버레이에서 공유된다.

### 1. 구현 파일 작성

`src/lib/condition/kinds/<이름>.tsx` 를 생성한다.

```tsx
// src/lib/condition/kinds/volumeSpike.tsx
"use client";

import type { ConditionKind } from "../types";
import type { StockMetricsDTO } from "@/types/deck";
import styles from "@/components/filter/inputs.module.css";

export interface VolumeSpikeValue {
    minRatio: number; // 분봉 거래량이 평균의 N배 이상
}

export const volumeSpikeCondition: ConditionKind<VolumeSpikeValue> = {
    kind: "volumeSpike",
    label: "거래량 급증",
    defaultValue: () => ({ minRatio: 2 }),
    chipFragment: ({ minRatio }) => `거래량 ≥${minRatio}배`,
    eval: (m: StockMetricsDTO, v: VolumeSpikeValue) => {
        // StockMetricsDTO에서 평가 가능한 필드를 사용한다
        // 평가 불가능한 필드는 null 체크 후 false 반환
        if (m.someField === null) return false;
        return m.someField >= v.minRatio;
    },
    Input: ({ value, onChange }) => (
        <div className={styles.row}>
            <label className={styles.label}>거래량 배율 ≥</label>
            <input
                className={styles.input}
                type="number"
                step={0.5}
                min={1}
                value={value.minRatio}
                onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n) && n >= 1) onChange({ minRatio: n });
                }}
            />
            <span>배</span>
        </div>
    ),
    serialize: ({ minRatio }) => String(minRatio),
    deserialize: (raw) => {
        const n = parseFloat(raw);
        return isNaN(n) ? null : { minRatio: n };
    },
};
```

### 2. 레지스트리 등록

`src/lib/condition/index.ts`의 `CONDITION_KINDS`에 추가한다.

```ts
import { volumeSpikeCondition } from "./kinds/volumeSpike";

export const CONDITION_KINDS: Record<string, ConditionKind<any>> = {
    // … 기존 …
    volumeSpike: volumeSpikeCondition,  // ← 추가
};
```

등록 후 `PredicateInput`의 "+" 드롭다운 메뉴에 자동으로 나타난다.

### 주의사항

- `eval`에서 null 필드는 항상 `false` 반환 처리한다 (null = 데이터 없음 = 조건 불통과).
- 차트 오버레이(`RealThemeOverlayChart`)에서는 `closeRate`·`cumulativeAmount` 외 필드를 평가할 수 없다(ADR-012). 새 조건이 다른 필드에 의존하면 차트 토글에서 항상 불통과로 표시된다.

---

## B. FilterKind 추가

FilterKind는 `ThemeRowData` 행 전체를 받아 포함 여부를 결정하는 필터다.
복수 인스턴스(`multiple: true`)가 필요한지 먼저 판단한다.

### 1. 구현 파일 작성

`src/lib/filter/kinds/<이름>.tsx` 를 생성한다.

```tsx
// src/lib/filter/kinds/themeSize.tsx
"use client";

import type { FilterKind } from "./types";
import { RangeInput } from "@/components/filter/inputs/RangeInput";

interface ThemeSizeValue {
    min: number | null;
    max: number | null;
}

export const themeSizeKind: FilterKind<ThemeSizeValue> = {
    kind: "themeSize",
    label: "테마 크기",
    section: "theme",
    multiple: false,

    defaultValue: () => ({ min: null, max: null }),

    chipLabel: (v) => {
        if (v.min === null && v.max === null) return "";  // 빈 칩 = 비활성
        const parts: string[] = [];
        if (v.min !== null) parts.push(`≥${v.min}`);
        if (v.max !== null) parts.push(`≤${v.max}`);
        return `테마 크기 ${parts.join(" ")}`;
    },

    match: (row, v) => {
        if (v.min !== null && row.themeSize < v.min) return false;
        if (v.max !== null && row.themeSize > v.max) return false;
        return true;
    },

    Input: ({ value, onChange }) => (
        <RangeInput
            label="테마 크기"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            step={1}
        />
    ),

    serialize: ({ min, max }) => `${min ?? ""}..${max ?? ""}`,
    deserialize: (raw) => {
        const idx = raw.indexOf("..");
        if (idx === -1) return null;
        const min = raw.slice(0, idx) === "" ? null : parseInt(raw.slice(0, idx), 10);
        const max = raw.slice(idx + 2) === "" ? null : parseInt(raw.slice(idx + 2), 10);
        return { min: min ?? null, max: max ?? null };
    },
};
```

**`match` 4번째 인자 `instanceId`**: `activeMembersInTheme`처럼 `derivedMap`의 특정 풀을 참조해야 할 때만 사용한다. 단순 행 필터는 무시해도 된다.

### 2. 레지스트리 등록

`src/lib/filter/kinds/index.ts`의 `KINDS`에 추가한다.

```ts
import { themeSizeKind } from "./themeSize";

export const KINDS: Record<string, FilterKind<any>> = {
    // … 기존 …
    themeSize: themeSizeKind,  // ← 추가
};
```

### 3. FilterPanel 섹션 연결

`multiple: false` 필터는 `src/components/filter/FilterPanel.tsx`의 해당 섹션에 `<SingleFilterSection kind="themeSize" … />` 1줄을 추가한다.

`multiple: true` 필터는 `<MultiFilterSection kind="themeSize" … />`으로 추가한다.

### 주의사항

- `chipLabel`이 빈 문자열(`""`)을 반환하면 칩바에 표시되지 않는다. 비활성 상태의 기본값에서 반드시 `""` 반환.
- `multiple: false` 필터는 `useFilterState`가 `instances.find`로 단 1개만 다룬다. FilterPanel에서 `SingleFilterSection`을 사용하면 자동으로 처리된다.
- `section` 필드는 FilterPanel의 렌더 분기에 직접 사용되지 않고 의미 레이블 역할만 한다. 새 섹션 추가 시 FilterPanel에 `<section>` 블록도 추가해야 한다.

---

## 검증 방법

1. `pnpm dev`로 서버 시작.
2. `/filtered` 페이지 → 필터 패널 열기 → 새 입력 UI가 올바른 섹션에 표시되는지 확인.
3. 값 변경 시 URL의 `?f=` 배열에 새 인스턴스가 추가되는지 확인.
4. 칩바에 칩이 표시되고, ×를 눌러 제거되는지 확인.
5. 조건을 만족하지 않는 행이 목록에서 사라지는지 확인.
6. URL을 복사해 다른 탭에 붙여넣기 → 동일 필터 상태가 복원되는지 확인.

---

## 흔한 실수

| 실수 | 증상 | 수정 |
|------|------|------|
| `chipLabel`이 기본값에서 `""` 미반환 | 비활성 상태에서도 칩 표시 | 기본값 조건에서 `return ""` |
| `deserialize`가 `null` 미반환 | URL 오염 시 에러 | 파싱 실패 분기에서 `return null` |
| `multiple: false`인데 FilterPanel에서 `MultiFilterSection` 사용 | 인스턴스 2개 이상 생성 가능 | `SingleFilterSection`으로 교체 |
| ConditionKind `eval`에서 null 미처리 | 데이터 없는 종목이 조건 통과 | `if (field === null) return false` |
