# Stock Chart 모드 — 작업 명세서

> 작성 목적: AI 에이전트가 단계별로 안전하게 구현·커밋·검증할 수 있도록 명세화한 문서.
> 대상 앱: `apps/data-view`
> 작업 브랜치: `genspark_ai_developer`
> 신규 라우트: `/stock-chart` (기존 `/from-date-theme` 디렉토리는 삭제)

---

## 0. 전체 개요

### 0.1 목표

`/filtered` 화면처럼 차트 모달을 띄우되, **사전 필터/덱 로딩 없이** 한 줄의 텍스트(이미지 파일명 또는 CSV 한 줄)를 붙여넣고 **엔터 키를 누르거나 옆에 있는 엔터 버튼을 클릭**하면, 해당 종목·날짜의 **테마 목록**을 받아 사용자가 테마를 선택하면 기존 `ChartModal`을 그대로 띄운다.

### 0.2 확정된 설계 결정 (요약)

| # | 결정사항 |
|---|----------|
| 1 | CSV 컬럼 순서 유지 — 입력은 **파서 레지스트리 패턴**으로 똑똑하게 처리 |
| 2 | 등록 파서: `imageFilename` / `csvLine` 두 종. **폴백 파서 없음** |
| 3 | `tradeTime` 기본값 `15:30:00` — UI 표시 없음, 내부 전용 |
| 4 | 신규 서버 액션 `fetchStockThemesAction(stockCode, tradeDate)` — 테마 목록만 반환 |
| 5 | 테마 1개면 자동 진행, 2개 이상이면 칩 UI에서 선택 |
| 6 | 칩 UI는 박스 **내부**, 입력 필드 **아래** |
| 7 | 모달 닫은 후 입력값과 칩 목록 **유지** (다른 테마 비교 가능) |
| 8 | 파싱 미리보기 표시 (사용된 파서 라벨 포함) |
| 9 | 페이지명 "Stock Chart", 라우트 `/stock-chart` |
| 10 | 기존 `from-date-theme/` 디렉토리 **삭제 후 신규 생성** |
| 11 | 입력 디바운싱 300ms (파싱 미리보기용) — **차트 모달 오픈은 디바운싱과 무관, 엔터/버튼으로 명시적 트리거** |
| 12 | 차트 모달 오픈은 **엔터 키 입력 또는 엔터 버튼 클릭** 시점에만 발생 (자동 오픈 없음) |
| 13 | `ChartModalTarget.themeId` 필수 유지. `activePools`, `priceLines`는 `undefined`로 전달 |
| 14 | 마커 텍스트 "Point" 그대로 유지 |
| 15 | ModeTabs 순서 `[Filtered] [Stock Chart]` |
| 16 | 서버 액션 응답은 프로젝트 컨벤션 `Result<T extends Record<string, unknown>>` 패턴을 따른다 (`okResult({...})` / `errResult(err)`). 응답 타입은 `{ ok: true, ...payload } | { ok: false, error }` 형태 |
| 17 | 모든 커밋 메시지는 **한국어**로 작성 |

### 0.3 작업 브랜치 & 커밋 정책

- 모든 작업은 `genspark_ai_developer` 브랜치에서 진행.
- **단계 종료 시점마다 즉시 커밋**할 것. 한 단계가 끝나기 전에는 다음 단계 파일을 만들지 말 것.
- 커밋 메시지는 **한국어 + Conventional Commit prefix** 형식 (`feat(scope): 설명` / `fix(scope): 설명` / `docs(scope): 설명`).
- 각 단계 끝에 `pnpm --filter @trade-data-manager/data-view type-check` 와 `pnpm --filter @trade-data-manager/data-view lint` 가 통과해야 한다.
- 모든 단계 완료 후 squash 커밋 + PR 업데이트.

---

## 1. 전체 데이터 흐름

```
[ Stock Chart 페이지 ]
       │
   사용자 입력 (텍스트)
       │      ┌─ debounce 300ms ─→ 파싱 미리보기 갱신
       │      │
       │      └─ Enter 키 / 엔터 버튼 클릭 ──┐
       │                                       │
       ▼                                       ▼
[ parseChartTarget(raw) ]            [ 명시적 트리거 → 모달 오픈 흐름 ]
       │       lib/parser/  (레지스트리)
       │
   ┌───┴───────────┐
   │ ok: false     │ ok: true { stockCode, tradeDate, usedParser }
   │               │
   ▼               ▼
 에러 메시지    fetchStockThemesAction(stockCode, tradeDate)
                   │   (React Query 캐싱)
                   ▼
            ChartThemeMeta[]   (themeId, themeName)
                   │
            ┌──────┴───────┐
            │ 1개          │ 2개 이상
            ▼              ▼
       엔터/버튼 시       엔터/버튼 시 칩 UI 표시
       바로 모달 OPEN     → 사용자 칩 클릭 → 모달 OPEN
                          
       useChartModalStore.open({
           stockCode, stockName, tradeDate,
           tradeTime: "15:30:00",
           themeId,
           activePools: undefined,
           priceLines: undefined,
       })
                          │
                          ▼
                  기존 ChartModal 재사용
                    (fetchChartPreviewAction)
```

### 1.1 입력 트리거 흐름 (변경된 부분 핵심)

1. 사용자 타이핑 → `raw` state 업데이트
2. `useDebouncedValue(raw, 300)` → `debouncedRaw` 도출
3. `parseChartTarget(debouncedRaw)` → 미리보기 UI 갱신 (실시간, 모달 오픈 X)
4. **엔터 키 또는 엔터 버튼 클릭 시**:
   - 현재 입력 `raw`를 즉시 파싱 (디바운스 우회)
   - 파싱 성공이고 **테마 목록이 이미 받아져 있고** 1개라면 → 즉시 모달 OPEN
   - 파싱 성공이고 테마 목록이 2개 이상이면 → 칩 UI는 이미 보이는 상태이므로 클릭 안내 (또는 첫 번째 칩 자동 선택은 하지 않음 — 사용자 선택을 기다림)
   - 파싱 실패면 미리보기 에러 메시지 유지 (모달 안 열림)
5. 모달 닫은 후 동일 입력에서 다시 엔터/버튼 누르면 다시 모달 OPEN (자동 재오픈 가드 불필요)

> 💡 **자동 진행 가드 제거**: 이전 명세에서는 "자동으로 모달이 열리니까 한 번만 열리도록 ref로 가드"가 필요했지만, **엔터/버튼 명시 트리거 방식으로 바뀌면서 가드가 불필요**해졌다. 사용자가 다시 엔터를 누르면 같은 모달을 다시 열 수 있게 된다.

---

## 2. 단계별 작업 명세

> ⚠️ 각 단계 끝에 **반드시 커밋**한다. 다음 단계로 넘어가기 전에 검증 항목을 통과해야 한다.

---

### Step 1 — 파서 레지스트리 스캐폴딩 (`lib/parser/`)

**커밋 메시지**: `feat(data-view): 차트 타겟 파서 레지스트리 스캐폴딩 추가`

#### 1.1 신규 파일

```
apps/data-view/src/lib/parser/
├── types.ts
├── utils.ts
├── index.ts
└── kinds/
    ├── imageFilename.ts
    └── csvLine.ts
```

#### 1.2 `lib/parser/types.ts`

```ts
/** 파싱 결과: 정규화된 종목코드 + 날짜 */
export interface ParsedChartTarget {
    stockCode: string;  // 6자리 숫자 문자열
    tradeDate: string;  // "YYYY-MM-DD" (ISO 정규화)
}

/** 파서 식별자 */
export type ChartTargetParserKind = "imageFilename" | "csvLine";

/** 파서 인터페이스 (FilterKind/ConditionKind 패턴과 동일 컨벤션) */
export interface ChartTargetParser {
    kind: ChartTargetParserKind;
    /** UI 라벨 (파싱 미리보기에서 사용자에게 표시) */
    label: string;
    /** 빠른 판별 — 이 파서가 처리할 수 있는 형식인가? */
    canParse: (raw: string) => boolean;
    /** 실제 파싱. 실패 시 null */
    parse: (raw: string) => ParsedChartTarget | null;
}

/** 통합 파싱 결과 */
export type ParseChartTargetResult =
    | { ok: true; target: ParsedChartTarget; usedParser: ChartTargetParser }
    | { ok: false; reason: ParseChartTargetFailureReason };

export type ParseChartTargetFailureReason =
    | "empty"          // 빈 입력
    | "no-match"       // 어떤 파서도 canParse=true 가 아님
    | "no-stock-code"; // 파서는 매칭됐으나 종목코드/날짜 추출 실패
```

> 💡 `result.ts`의 `Result<T>` 타입은 서버 액션 경계에서만 쓰는 컨벤션이고, 파서 내부 결과는 일반 discriminated union 으로 두는 게 적절. (서버 액션이 아니라 순수 함수이고, 페이로드 형태가 `Record<string, unknown>` 제약을 만족시키기 어색하기 때문.)

#### 1.3 `lib/parser/utils.ts` (신규)

```ts
const STOCK_CODE_RE = /^\d{6}$/;
const DATE_RES = [
    /^(\d{4})-(\d{2})-(\d{2})$/,    // YYYY-MM-DD
    /^(\d{4})\.(\d{2})\.(\d{2})$/,  // YYYY.MM.DD
    /^(\d{4})(\d{2})(\d{2})$/,      // YYYYMMDD
];

export function isStockCode(token: string): boolean {
    return STOCK_CODE_RE.test(token);
}

export function isDateLike(token: string): boolean {
    return DATE_RES.some((re) => re.test(token));
}

/** 다양한 날짜 포맷을 "YYYY-MM-DD" 로 정규화. 실패 시 null. */
export function normalizeDate(token: string): string | null {
    for (const re of DATE_RES) {
        const m = token.match(re);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return null;
}
```

#### 1.4 `lib/parser/kinds/imageFilename.ts`

```ts
import type { ChartTargetParser, ParsedChartTarget } from "../types";
import { normalizeDate, isDateLike, isStockCode } from "../utils";

export const imageFilenameParser: ChartTargetParser = {
    kind: "imageFilename",
    label: "이미지 파일명",
    canParse: (raw) => {
        const tokens = raw.trim().split("_");
        if (tokens.length < 2) return false;
        return isDateLike(tokens[0]) && isStockCode(tokens[1]);
    },
    parse: (raw): ParsedChartTarget | null => {
        const tokens = raw.trim().split("_");
        if (tokens.length < 2) return null;
        const tradeDate = normalizeDate(tokens[0]);
        if (!tradeDate) return null;
        if (!isStockCode(tokens[1])) return null;
        return { stockCode: tokens[1], tradeDate };
    },
};
```

#### 1.5 `lib/parser/kinds/csvLine.ts`

```ts
import type { ChartTargetParser, ParsedChartTarget } from "../types";
import { normalizeDate, isDateLike, isStockCode } from "../utils";

export const csvLineParser: ChartTargetParser = {
    kind: "csvLine",
    label: "CSV 한 줄",
    canParse: (raw) => raw.includes(","),
    parse: (raw): ParsedChartTarget | null => {
        const tokens = raw.trim().split(",").map((t) => t.trim());
        let stockCode: string | null = null;
        let tradeDate: string | null = null;
        for (const token of tokens) {
            if (!stockCode && isStockCode(token)) {
                stockCode = token;
                continue;
            }
            if (!tradeDate && isDateLike(token)) {
                const norm = normalizeDate(token);
                if (norm) tradeDate = norm;
            }
            if (stockCode && tradeDate) break;
        }
        if (!stockCode || !tradeDate) return null;
        return { stockCode, tradeDate };
    },
};
```

#### 1.6 `lib/parser/index.ts`

```ts
import { imageFilenameParser } from "./kinds/imageFilename";
import { csvLineParser } from "./kinds/csvLine";
import type { ChartTargetParser, ParseChartTargetResult } from "./types";

/**
 * 파서 우선순위 — 위에서 아래로 시도.
 * imageFilename 이 먼저 시도되어야 하는 이유: csvLine 의 canParse 가 ","만 보므로
 * 이미지 파일명에 우연히 ","가 섞여 있어도 imageFilename 이 선점한다.
 */
export const CHART_TARGET_PARSERS: readonly ChartTargetParser[] = [
    imageFilenameParser,
    csvLineParser,
];

export function parseChartTarget(raw: string): ParseChartTargetResult {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, reason: "empty" };

    let matchedAnyParser = false;
    for (const parser of CHART_TARGET_PARSERS) {
        if (!parser.canParse(trimmed)) continue;
        matchedAnyParser = true;
        const result = parser.parse(trimmed);
        if (result) {
            return { ok: true, target: result, usedParser: parser };
        }
    }

    if (!matchedAnyParser) return { ok: false, reason: "no-match" };
    return { ok: false, reason: "no-stock-code" };
}

export type {
    ParsedChartTarget,
    ChartTargetParser,
    ChartTargetParserKind,
    ParseChartTargetResult,
    ParseChartTargetFailureReason,
} from "./types";
```

#### 1.7 단계 검증

- [ ] `pnpm --filter @trade-data-manager/data-view type-check` 통과
- [ ] `pnpm --filter @trade-data-manager/data-view lint` 통과
- [ ] **커밋**: `feat(data-view): 차트 타겟 파서 레지스트리 스캐폴딩 추가`

---

### Step 2 — 서버 액션 `fetchStockThemesAction` 추가

**커밋 메시지**: `feat(data-view): Stock Chart용 fetchStockThemesAction 추가`

#### 2.1 변경 파일

- `apps/data-view/src/actions/chartPreview.ts` — 동일 파일에 신규 액션 append

#### 2.2 핵심: `Result<T>` 컨벤션 준수

`lib/result.ts` 에 정의된 시그니처:
- `Result<T extends Record<string, unknown>> = { ok: true } & T | { ok: false; error: string }`
- `okResult(payload)` 는 `{ ok: true, ...payload }`로 spread.

→ **응답 타입은 `Result<{ themes: ChartThemeMeta[]; selfStockName: string }>`** 로 정의하고, `okResult({ themes, selfStockName })` 로 반환한다. (기존 `fetchChartPreviewAction`이 `Result<{ data: ChartPreviewDTO }>` 형태로 한 번 감싸는 컨벤션을 따르고 있으므로, 새 액션도 같은 컨벤션을 따른다.)

#### 2.3 추가 코드 (파일 끝부분에 append)

```ts
/** Stock Chart 모드에서 테마 칩 목록을 빠르게 보여주기 위한 경량 액션.
 *  fetchChartPreviewAction 의 캔들 처리 비용을 생략하고 themeId/themeName 만 반환한다.
 */
export interface ChartThemeMeta {
    themeId: string;
    themeName: string;
}

export interface StockThemesDTO {
    themes: ChartThemeMeta[];
    selfStockName: string;
}

export async function fetchStockThemesAction(params: {
    stockCode: string;
    tradeDate: string;
}): Promise<Result<{ data: StockThemesDTO }>> {
    try {
        const db = getDataViewDb();
        const bundles = await getThemeBundle(db, {
            stockCode: params.stockCode,
            tradeDate: params.tradeDate,
        });

        const self = pickSelfMember(bundles);
        const themes: ChartThemeMeta[] = bundles.map((b) => ({
            themeId: b.themeId,
            themeName: b.themeName,
        }));

        return okResult({
            data: {
                themes,
                selfStockName: self?.stockName ?? params.stockCode,
            },
        });
    } catch (err) {
        return errResult(err);
    }
}
```

#### 2.4 단계 검증

- [ ] type-check 통과
- [ ] lint 통과
- [ ] `/filtered` 페이지 동작에 영향 없음
- [ ] **커밋**: `feat(data-view): Stock Chart용 fetchStockThemesAction 추가`

---

### Step 3 — React Query 훅 `useStockThemes`

**커밋 메시지**: `feat(data-view): useStockThemes 훅 추가`

#### 3.1 신규 파일

- `apps/data-view/src/hooks/useStockThemes.ts`

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStockThemesAction, type StockThemesDTO } from "@/actions/chartPreview";

export function useStockThemes(
    params: { stockCode: string; tradeDate: string } | null,
) {
    return useQuery<StockThemesDTO>({
        queryKey: ["stock-themes", params?.stockCode, params?.tradeDate],
        queryFn: async () => {
            const res = await fetchStockThemesAction(params!);
            if (!res.ok) throw new Error(res.error);
            return res.data;
        },
        enabled: params !== null,
    });
}
```

> 💡 `staleTime`/`gcTime` 은 `QueryProvider`의 기본값(5분/30분)을 그대로 상속.

#### 3.2 단계 검증

- [ ] type-check 통과 / lint 통과
- [ ] **커밋**: `feat(data-view): useStockThemes 훅 추가`

---

### Step 4 — 디바운스 훅 `useDebouncedValue`

**커밋 메시지**: `feat(data-view): useDebouncedValue 훅 추가`

#### 4.1 신규 파일

```ts
// apps/data-view/src/hooks/useDebouncedValue.ts
"use client";

import { useEffect, useState } from "react";

/** value 의 변경을 delay(ms) 만큼 지연시켜 반환. */
export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}
```

#### 4.2 단계 검증

- [ ] type-check 통과 / lint 통과
- [ ] **커밋**: `feat(data-view): useDebouncedValue 훅 추가`

---

### Step 5 — `/stock-chart` 라우트 스캐폴딩 + `from-date-theme` 삭제

**커밋 메시지**: `feat(data-view): /stock-chart 라우트 스캐폴딩 및 from-date-theme 제거`

#### 5.1 변경

1. **삭제**: `apps/data-view/src/app/(main)/from-date-theme/` 디렉토리 전체
2. **신규**: `apps/data-view/src/app/(main)/stock-chart/page.tsx`
3. **신규**: `apps/data-view/src/app/(main)/stock-chart/StockChartClient.tsx` (placeholder)
4. **신규**: `apps/data-view/src/app/(main)/stock-chart/StockChart.module.css`

#### 5.2 `stock-chart/page.tsx`

```tsx
import { StockChartClient } from "./StockChartClient";

export default function StockChartPage() {
    return <StockChartClient />;
}
```

#### 5.3 `stock-chart/StockChartClient.tsx` (placeholder)

```tsx
"use client";

import styles from "./StockChart.module.css";

export function StockChartClient() {
    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <h2 className={styles.title}>Stock Chart</h2>
                {/* 입력 폼은 다음 단계에서 구현 */}
            </div>
        </div>
    );
}
```

#### 5.4 `stock-chart/StockChart.module.css`

```css
.page {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6) 0;
    min-height: 60vh;
}

.card {
    width: min(640px, 100%);
    padding: var(--space-6);
    background: var(--bg-primary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
}

.title {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
    margin: 0 0 var(--space-4);
    color: var(--text-primary);
}
```

#### 5.5 단계 검증

- [ ] `/stock-chart` 접근 시 빈 카드 렌더링됨
- [ ] `/from-date-theme` 접근 시 404
- [ ] type-check / lint 통과
- [ ] **커밋**: `feat(data-view): /stock-chart 라우트 스캐폴딩 및 from-date-theme 제거`

---

### Step 6 — ModeTabs 갱신

**커밋 메시지**: `feat(data-view): ModeTabs를 Stock Chart로 교체`

#### 6.1 변경

`apps/data-view/src/components/layout/ModeTabs.tsx`:

```diff
 const tabs = [
   { href: "/filtered", label: "Filtered" },
-  { href: "/from-date-theme", label: "From Date & Theme" },
+  { href: "/stock-chart", label: "Stock Chart" },
 ];
```

#### 6.2 단계 검증

- [ ] 헤더 탭에 "Stock Chart" 노출 / 클릭 시 `/stock-chart` 이동
- [ ] `/filtered` 무영향
- [ ] **커밋**: `feat(data-view): ModeTabs를 Stock Chart로 교체`

---

### Step 7 — 입력 폼 + 엔터 버튼 + 파싱 미리보기 UI

**커밋 메시지**: `feat(data-view): Stock Chart 입력 폼·엔터 버튼·파싱 미리보기 구현`

#### 7.1 변경 파일

- `apps/data-view/src/app/(main)/stock-chart/StockChartClient.tsx`
- `apps/data-view/src/app/(main)/stock-chart/StockChart.module.css`

#### 7.2 동작 명세

1. 컴포넌트 state:
   - `raw: string` — 현재 입력 값
   - `committed: string` — **엔터/버튼으로 명시적으로 확정된** 입력 값 (모달 트리거에 사용)
2. `useDebouncedValue(raw, 300)` → `debouncedRaw` (파싱 미리보기 갱신용)
3. 미리보기 파싱: `parseChartTarget(debouncedRaw)`
4. **엔터 키 또는 엔터 버튼 클릭 시**:
   - `setCommitted(raw)` 으로 현재 입력을 즉시 확정
   - 이 step 에서는 모달 오픈 로직이 없지만, 다음 step 에서 `committed` 변경을 감지해 모달 트리거 로직을 추가한다.
5. 미리보기 UI:
   - 입력이 비어있으면 미리보기 숨김
   - 파싱 성공 → `✓ 005930 · 2026-04-20 (이미지 파일명)` 초록
   - 파싱 실패 → 사유별 메시지
     - `no-match` → `✗ 형식을 인식하지 못했습니다.`
     - `no-stock-code` → `✗ 종목코드(6자리 숫자) 또는 날짜를 찾을 수 없습니다.`

#### 7.3 컴포넌트 스켈레톤

```tsx
"use client";

import { useMemo, useState, useCallback, type KeyboardEvent } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { parseChartTarget } from "@/lib/parser";
import styles from "./StockChart.module.css";

export function StockChartClient() {
    const [raw, setRaw] = useState("");
    const [committed, setCommitted] = useState("");
    const debouncedRaw = useDebouncedValue(raw, 300);

    const preview = useMemo(() => parseChartTarget(debouncedRaw), [debouncedRaw]);

    const commit = useCallback(() => {
        // 엔터/버튼 누른 순간을 새 트리거로 인식시키기 위해
        // 동일 값이라도 다시 확정될 수 있어야 한다 → 다음 step 에서 처리
        setCommitted(raw);
    }, [raw]);

    const onKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                commit();
            }
        },
        [commit],
    );

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <h2 className={styles.title}>Stock Chart</h2>

                <div className={styles.inputRow}>
                    <input
                        type="text"
                        className={styles.field}
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="예: 2026.04.20_005930_엑스게이트_KRX  /  079550,비에이치아이,2026-04-20,..."
                        aria-label="종목·날짜 입력"
                    />
                    <button
                        type="button"
                        className={styles.enterBtn}
                        onClick={commit}
                        aria-label="차트 열기 (Enter)"
                        disabled={!preview.ok}
                        title="Enter 또는 버튼 클릭으로 차트 열기"
                    >
                        ⏎
                    </button>
                </div>

                <PreviewLine preview={preview} hidden={debouncedRaw.trim() === ""} />
            </div>
        </div>
    );
}

function PreviewLine({
    preview,
    hidden,
}: {
    preview: ReturnType<typeof parseChartTarget>;
    hidden: boolean;
}) {
    if (hidden) return null;

    if (preview.ok) {
        return (
            <div className={`${styles.preview} ${styles.previewOk}`}>
                ✓ {preview.target.stockCode} · {preview.target.tradeDate}
                <span className={styles.previewParser}>({preview.usedParser.label})</span>
            </div>
        );
    }

    const message =
        preview.reason === "no-match"
            ? "✗ 형식을 인식하지 못했습니다."
            : preview.reason === "no-stock-code"
              ? "✗ 종목코드(6자리 숫자) 또는 날짜를 찾을 수 없습니다."
              : null;

    if (!message) return null;
    return <div className={`${styles.preview} ${styles.previewErr}`}>{message}</div>;
}
```

> 💡 엔터 버튼은 파싱 실패 시 `disabled`. 미리보기는 항상 디바운스 기반.

#### 7.4 CSS 토큰 추가

```css
.inputRow {
    display: flex;
    gap: var(--space-2);
    align-items: stretch;
}

.field {
    flex: 1;
    height: 44px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: var(--fs-md);
}
.field:focus {
    outline: 2px solid var(--accent-primary, #2563eb);
    outline-offset: -1px;
}

.enterBtn {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: var(--accent-bg, #e0e7ff);
    color: var(--accent-primary, #2563eb);
    font-size: 18px;
    font-weight: var(--fw-bold);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-fast);
    cursor: pointer;
}
.enterBtn:hover:not(:disabled) {
    background: var(--accent-primary, #2563eb);
    color: #fff;
}
.enterBtn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.preview {
    margin-top: var(--space-3);
    font-size: var(--fs-sm);
}
.previewOk { color: var(--success, #16a34a); }
.previewErr { color: var(--danger, #dc2626); }
.previewParser {
    color: var(--text-tertiary);
    margin-left: var(--space-1);
}
```

#### 7.5 단계 검증

- [ ] 입력하면 300ms 후 미리보기 갱신
- [ ] Enter 키 / 엔터 버튼 둘 다 동일하게 `committed` 갱신 (이 step 에선 모달 안 열림)
- [ ] 파싱 성공 시 버튼 활성화, 실패 시 비활성화
- [ ] type-check / lint 통과
- [ ] **커밋**: `feat(data-view): Stock Chart 입력 폼·엔터 버튼·파싱 미리보기 구현`

---

### Step 8 — 테마 칩 UI + 모달 오픈 로직

**커밋 메시지**: `feat(data-view): 테마 칩 UI와 ChartModal 오픈 로직 연결`

#### 8.1 변경 파일

- `apps/data-view/src/app/(main)/stock-chart/StockChartClient.tsx`
- `apps/data-view/src/app/(main)/stock-chart/StockChart.module.css`

#### 8.2 동작 명세

1. `committed` 가 성공적으로 파싱되면 (`committedParsed.ok === true`):
   - `useStockThemes({ stockCode, tradeDate })` 호출
2. 로딩/에러/성공 상태별 UI:
   - `isLoading` → `"테마 불러오는 중..."`
   - `isError` → `"해당 종목/날짜의 데이터가 없습니다."` (error.message 포함 가능)
   - 성공:
     - `themes.length === 1`: 박스 내부에 `"엔터를 누르거나 버튼을 클릭하면 차트를 엽니다"` 안내 + **엔터/버튼이 트리거된 순간** 모달 OPEN
     - `themes.length >= 2`: 칩 목록 표시 → 사용자가 칩 클릭 시 모달 OPEN
3. **모달 트리거 메커니즘** (자동 진행 가드 불필요):

   사용자가 엔터/버튼을 누를 때마다 새로 트리거되도록 `commitNonce` 카운터를 둔다:

   ```ts
   const [commitNonce, setCommitNonce] = useState(0);
   const commit = useCallback(() => {
       setCommitted(raw);
       setCommitNonce((n) => n + 1);
   }, [raw]);
   ```

   그리고 `commitNonce` 변경 시점에 "테마 1개라면 자동으로 모달 오픈" 효과를 트리거:

   ```ts
   const open = useChartModalStore((s) => s.open);
   const { data: themesData } = useStockThemes(
       committedParsed.ok
           ? { stockCode: committedParsed.target.stockCode, tradeDate: committedParsed.target.tradeDate }
           : null,
   );

   const lastHandledNonceRef = useRef(0);
   useEffect(() => {
       if (commitNonce === lastHandledNonceRef.current) return;
       if (!committedParsed.ok || !themesData) return;
       if (themesData.themes.length !== 1) {
           // 2개 이상이면 그대로 두고 사용자 칩 선택을 기다림
           lastHandledNonceRef.current = commitNonce;
           return;
       }
       lastHandledNonceRef.current = commitNonce;
       open({
           stockCode: committedParsed.target.stockCode,
           stockName: themesData.selfStockName,
           tradeDate: committedParsed.target.tradeDate,
           tradeTime: "15:30:00",
           themeId: themesData.themes[0].themeId,
           activePools: undefined,
           priceLines: undefined,
       });
   }, [commitNonce, committedParsed, themesData, open]);
   ```

4. 칩 클릭 핸들러는 즉시 모달 OPEN:
   ```ts
   const openWithTheme = (themeId: string) => {
       if (!committedParsed.ok || !themesData) return;
       open({
           stockCode: committedParsed.target.stockCode,
           stockName: themesData.selfStockName,
           tradeDate: committedParsed.target.tradeDate,
           tradeTime: "15:30:00",
           themeId,
           activePools: undefined,
           priceLines: undefined,
       });
   };
   ```

5. **`<ChartModal />` 마운트**: `FilteredClient` 와 동일한 방식으로 `StockChartClient` 최상위에 `<ChartModal />` 을 추가한다 (현 프로젝트는 페이지마다 마운트하는 컨벤션).

#### 8.3 칩 UI 마크업

```tsx
{committedParsed.ok && themesData && themesData.themes.length >= 2 && (
    <div className={styles.chips}>
        {themesData.themes.map((t) => (
            <button
                key={t.themeId}
                type="button"
                className={styles.chip}
                onClick={() => openWithTheme(t.themeId)}
            >
                #{t.themeName}
            </button>
        ))}
    </div>
)}
{committedParsed.ok && themesData && themesData.themes.length === 1 && (
    <div className={styles.hint}>
        테마 1개 — 엔터를 다시 누르면 차트를 엽니다.
    </div>
)}
{committedParsed.ok && isThemesLoading && (
    <div className={styles.hint}>테마 불러오는 중…</div>
)}
{committedParsed.ok && themesError && (
    <div className={styles.errorBox}>
        ✗ {themesError instanceof Error ? themesError.message : "데이터를 불러올 수 없습니다."}
    </div>
)}
```

#### 8.4 CSS 추가

```css
.chips {
    margin-top: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
}
.chip {
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--bg-secondary, #f3f4f6);
    border: 1px solid var(--border-subtle);
    color: var(--text-primary);
    font-size: var(--fs-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
}
.chip:hover {
    background: var(--bg-hover, #e5e7eb);
}
.hint {
    margin-top: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--fs-sm);
}
.errorBox {
    margin-top: var(--space-3);
    color: var(--danger, #dc2626);
    font-size: var(--fs-sm);
}
```

#### 8.5 단계 검증

- [ ] 입력 후 엔터/버튼 → 테마 1개면 모달 OPEN
- [ ] 입력 후 엔터/버튼 → 테마 N개면 칩 표시, 클릭 시 모달 OPEN
- [ ] 모달 ESC로 닫은 뒤 다시 엔터/버튼 누르면 모달이 다시 OPEN됨 (재오픈 가능)
- [ ] 모달 ESC로 닫은 뒤 다른 칩 클릭 → 해당 테마 모달 OPEN
- [ ] 잘못된 입력 → 모달 안 열림
- [ ] type-check / lint / build 통과
- [ ] `/filtered` 영향 없음
- [ ] **커밋**: `feat(data-view): 테마 칩 UI와 ChartModal 오픈 로직 연결`

---

### Step 9 — 최종 정리 + PR

#### 9.1 검증 명령어

```bash
cd /home/user/webapp
pnpm --filter @trade-data-manager/data-view type-check
pnpm --filter @trade-data-manager/data-view lint
pnpm --filter @trade-data-manager/data-view build   # 시간 허락 시
```

#### 9.2 푸시 & PR

```bash
git push -u origin genspark_ai_developer
# GitHub UI 또는 gh CLI 로 PR 생성: genspark_ai_developer → main
```

PR 제목 (한국어):
```
feat(data-view): Stock Chart 모드 추가 (텍스트 파싱 기반 차트 진입)
```

PR 본문 골자:
- 변경 요약 (탭 교체, 파서 레지스트리, 신규 액션/훅, 엔터 버튼 명시 트리거)
- 영향 범위 (`/filtered` 무영향, `ChartModal` 재사용, `from-date-theme` 제거)
- 점검 시나리오 표 (아래 Section 3 참고)

---

## 3. 점검 시나리오 (수동 회귀)

| # | 입력 | 동작 | 기대 |
|---|------|------|------|
| 1 | `2026.04.20_007660_이수페타시스_KRX` | 입력 → Enter | 테마 1개면 모달 OPEN, N개면 칩 표시 |
| 2 | `079550,비에이치아이,2026-04-20,09:21:00,…` | 입력 → 버튼 클릭 | 동일 |
| 3 | `,,2026-04-20,비에이치아이,079550,,` | 위치 무관 CSV | 정상 파싱 |
| 4 | 정상 입력 후 모달 OPEN → ESC → 다시 Enter | 재오픈 | 모달 다시 OPEN |
| 5 | 칩 표시 상태에서 다른 칩 클릭 | 다른 테마 모달 | OPEN |
| 6 | `2026-04-20` (종목코드 없음) | 미리보기 에러, 버튼 disabled | 모달 안 열림 |
| 7 | `aaaaaa` | `✗ 형식을 인식하지 못했습니다.` | 모달 안 열림 |
| 8 | `/filtered` 진입·동작 | 회귀 없음 | 이전과 동일 |

---

## 4. 영향 범위 / 비영향 보증

| 영역 | 변경 여부 | 비고 |
|------|----------|------|
| `/filtered` 페이지 | ❌ 무변경 | 모든 필터/EntryRow/덱 로직 미수정 |
| `ChartModal` / `useChartPreview` | ❌ 무변경 | 그대로 재사용 |
| `fetchChartPreviewAction` | ❌ 무변경 | 새 액션을 동일 파일에 append만 |
| `useChartModalStore` | ❌ 무변경 | `activePools`/`priceLines` 이미 optional |
| `/from-date-theme` 라우트 | ⛔ 삭제 | placeholder 페이지만 있었음 |
| `ModeTabs` | ✅ 1줄 수정 | 라벨/URL 교체 |
| `actions/chartPreview.ts` | ✅ append | 새 액션 + 타입 추가 |
| 신규 파일 | ✅ 추가 | `lib/parser/**`, `hooks/useStockThemes.ts`, `hooks/useDebouncedValue.ts`, `app/(main)/stock-chart/**` |

---

## 5. 규칙 요약

- ✅ 각 Step 끝에서 **즉시 한국어 커밋**.
- ✅ 한 단계가 통과(type-check + lint)되기 전 다음 단계 시작 금지.
- ✅ 서버 액션 응답은 `Result<T>` + `okResult/errResult` 컨벤션 준수.
- ✅ 차트 모달 오픈은 **엔터 키 또는 엔터 버튼 클릭** 시점에만 발생 (자동 오픈 금지).
- ✅ 신규 파서 추가 시 `CHART_TARGET_PARSERS` 순서를 의식.
- ✅ 마지막에 푸시 & PR 생성.
