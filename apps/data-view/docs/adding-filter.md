# 새 필터 추가 가이드

## 수정해야 하는 파일

| 파일 | 할 일 |
|------|-------|
| `src/lib/filter/registry/index.ts` | `FILTERS` 배열에 정의 객체 1줄 추가 |

## 추가해야 하는 파일

| 파일 | 내용 |
|------|------|
| `src/lib/filter/registry/<filterName>.ts` | `FilterDefinition` 구현체 1개 |

## 단계별 절차

### 1. 정의 파일 작성

`src/lib/filter/registry/` 에 새 파일을 만듭니다.

```ts
// src/lib/filter/registry/tradeAmount.ts
import type { FilterDefinition } from "./types";
import type { ThemeRowData } from "@/types/deck";
import { RangeInput } from "@/components/filter/inputs/RangeInput";

export const tradeAmountFilter: FilterDefinition<{ min: number | null; max: number | null }> = {
    id: "tradeAmount",
    label: "거래대금",
    urlKeys: ["taMin", "taMax"],

    defaultValue: { min: null, max: null },

    toUrlParams: (v) => ({ taMin: v.min, taMax: v.max }),
    fromUrlParams: (p) => ({ min: p.taMin ?? null, max: p.taMax ?? null }),

    isActive: (v) => v.min !== null || v.max !== null,
    chipLabel: (v) => {
        const parts: string[] = [];
        if (v.min !== null) parts.push(`≥ ${v.min}억`);
        if (v.max !== null) parts.push(`≤ ${v.max}억`);
        return `거래대금 ${parts.join(" ")}`;
    },

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

### 2. 레지스트리에 등록

`src/lib/filter/registry/index.ts` 의 `FILTERS` 배열에 한 줄 추가합니다.

```ts
import { tradeAmountFilter } from "./tradeAmount";

export const FILTERS = [
    themeSizeFilter,
    // ... 기존 필터들 ...
    tradeAmountFilter,   // ← 추가
] as const;
```

등록 순서가 `FilterPanel` 의 표시 순서가 됩니다.

## 검증 방법

1. `pnpm dev` 로 서버를 시작합니다.
2. `/filtered` 페이지에서 필터 패널을 열어 새 입력 UI가 표시되는지 확인합니다.
3. 값을 입력하면 URL에 `taMin=…` 파라미터가 추가되는지 확인합니다.
4. 칩바에 칩이 표시되고, 클릭 시 필터가 제거되는지 확인합니다.
5. 필터 조건에 맞지 않는 행이 목록에서 사라지는지 확인합니다.

## 흔한 실수

- `urlKeys` 배열에 기존 필터와 겹치는 URL 파라미터 이름을 쓰면 충돌합니다. `useFilterState.ts` 의 `filterParsers` 키 목록을 먼저 확인하세요.
- `isActive` 를 잘못 구현하면 기본값일 때도 칩이 표시될 수 있습니다.
- `match` 에서 null 체크를 빠뜨리면 필터가 없을 때도 행이 제외됩니다.
