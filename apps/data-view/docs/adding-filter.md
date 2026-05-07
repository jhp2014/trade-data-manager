# 새 필터 추가 가이드

## 수정해야 하는 파일

| 파일 | 할 일 |
|------|-------|
| `src/lib/filter/registry/urlParams.ts` | 새 URL 파라미터 키 추가 (기존 키로 충분하면 생략 가능) |
| `src/hooks/useFilterState.ts` | `filterParsers` 에 새 키 + nuqs 파서 추가 |
| `src/lib/filter/registry/index.ts` | `FILTERS` 배열에 정의 객체 1줄 추가 |

## 추가해야 하는 파일

| 파일 | 내용 |
|------|------|
| `src/lib/filter/registry/<filterName>.ts(x)` | `FilterDefinition` 구현체 1개 |

> **참고**: 기존 URL 파라미터를 재사용하는 경우 `urlParams.ts`와 `useFilterState.ts` 수정이 불필요합니다.

## 단계별 절차

### 1. URL 파라미터 추가 (신규 키가 필요한 경우)

`src/lib/filter/registry/urlParams.ts` 에 파라미터를 추가합니다.

```ts
export interface FilterUrlParams {
    // ... 기존 키들 ...
    taMin: number | null;   // ← 추가
    taMax: number | null;   // ← 추가
}
```

그리고 `src/hooks/useFilterState.ts` 의 `filterParsers` 에도 추가합니다.

```ts
const filterParsers = {
    // ... 기존 파서들 ...
    taMin: parseAsFloat,   // ← 추가
    taMax: parseAsFloat,   // ← 추가
};
```

### 2. 정의 파일 작성

`src/lib/filter/registry/` 에 새 파일을 만듭니다.

```ts
// src/lib/filter/registry/tradeAmount.tsx
import type { FilterDefinition } from "./types";
import type { ThemeRowData } from "@/types/deck";
import { RangeInput } from "@/components/filter/inputs/RangeInput";

type Value = { min: number | null; max: number | null };

export const tradeAmountFilter: FilterDefinition<Value> = {
    id: "tradeAmount",
    label: "거래대금",
    section: "target",

    defaultValue: { min: null, max: null },

    fromUrl: (p) => ({ min: p.taMin ?? null, max: p.taMax ?? null }),
    toUrl: (v) => ({ taMin: v.min, taMax: v.max }),

    // 활성 칩 목록 — 비활성이면 빈 배열 반환
    chips: (v) => {
        if (v.min === null && v.max === null) return [];
        const parts: string[] = [];
        if (v.min !== null) parts.push(`≥ ${v.min}억`);
        if (v.max !== null) parts.push(`≤ ${v.max}억`);
        return [{ id: "tradeAmount", label: `거래대금 ${parts.join(" ")}` }];
    },

    // 칩 ID 기준으로 해당 칩을 제거한 값 반환
    clearChip: (_chipId, _current) => ({ min: null, max: null }),

    match: (row: ThemeRowData, v) => {
        const amt = row.self.cumulativeAmount === null
            ? 0
            : Number(row.self.cumulativeAmount) / 1e8;
        if (v.min !== null && amt < v.min) return false;
        if (v.max !== null && amt > v.max) return false;
        return true;
    },

    Input: ({ value, onChange }) => (
        <RangeInput
            label="거래대금 (억)"
            minValue={value.min}
            maxValue={value.max}
            onMinChange={(n) => onChange({ ...value, min: n })}
            onMaxChange={(n) => onChange({ ...value, max: n })}
            step={1}
        />
    ),
};
```

### 3. 레지스트리에 등록

`src/lib/filter/registry/index.ts` 의 `FILTERS` 배열에 한 줄 추가합니다.

```ts
import { tradeAmountFilter } from "./tradeAmount";

export const FILTERS: AnyFilterDef[] = [
    themeSizeFilter,
    // ... 기존 필터들 ...
    tradeAmountFilter,   // ← 추가
];
```

등록 순서가 `FilterPanel` 의 표시 순서가 됩니다. `section` 값에 따라 자동으로 섹션별로 그룹화됩니다.

## 검증 방법

1. `pnpm dev` 로 서버를 시작합니다.
2. `/filtered` 페이지에서 필터 패널을 열어 새 입력 UI가 표시되는지 확인합니다.
3. 값을 입력하면 URL에 `taMin=…` 파라미터가 추가되는지 확인합니다.
4. 칩바에 칩이 표시되고, 클릭 시 필터가 제거되는지 확인합니다.
5. 필터 조건에 맞지 않는 행이 목록에서 사라지는지 확인합니다.

## 흔한 실수

- `urlParams.ts` 에 키를 추가했지만 `useFilterState.ts` 의 `filterParsers` 에 추가하지 않으면 URL 파라미터가 무시됩니다.
- `chips()` 가 `defaultValue` 에서 빈 배열을 반환하지 않으면 기본값일 때도 칩이 표시됩니다.
- `match()` 에서 null 체크를 빠뜨리면 필터가 없을 때도 행이 제외됩니다.
- `clearChip()` 에서 해당 칩만 제거하고 나머지 값은 유지해야 합니다 (여러 칩을 생성하는 필터의 경우).
