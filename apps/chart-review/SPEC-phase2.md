# chart-review 2차 명세 — 실 차트 렌더링 (트랙 A)

> 선행: SPEC.md(1차, mock 골격 완료). 이 문서는 placeholder 차트를 **data-view의 차트 코드를
> fork(copy-and-prune)** 해서 실제 lightweight-charts 분봉/일봉으로 교체한다.
> Sheets API / DB manual 저장 / 테마 전환 / overlay·theme view mode 는 여전히 범위 밖.

---

## 0. 목표 한 줄

mock SheetRow는 그대로 두고(리스트/탐색 소스), **선택된 group(stockCode, tradeDate) + point(tradeTime)**
기준으로 DB에서 분봉/일봉을 조회해 summary 화면의 좌측 일봉·우측 분봉을 실제 차트로 렌더한다.

---

## 1. 핵심 결정 (왜 fork인가)

- 차트 렌더링 React 코드는 공유 패키지가 아니라 `apps/data-view` 안에 앱-로컬로 묶여 있다.
  data-view는 동결되므로 **패키지 추출 대신 fork**가 정석(SPEC.md 2절 재확인).
- fork 원칙: **forked 파일은 가능한 한 그대로 복사**하고, 그 파일들이 기대하는 작은 인터페이스
  (예: `useUiStore`의 `chartPriceMode`)를 chart-review 쪽에 **동일한 모양으로 재현**해서
  forked 코드 수정을 최소화한다. (수정이 적을수록 이식 버그가 적다.)
- 데이터 조회는 `@trade-data-manager/data-core`(공유) + server action으로. 이건 fork 아님, 재사용.

---

## 2. 추가 의존성 (apps/chart-review/package.json)

```jsonc
"dependencies": {
  "@tanstack/react-query": "^5.59.0",
  "@trade-data-manager/chart-utils": "workspace:*",   // 신규 추가 (kstHHmm/kstYmd/highMarkerColor/fillMissingMinuteCandles)
  "@trade-data-manager/data-core": "workspace:*",     // 신규 추가 (getThemeBundle 등)
  "dayjs": "^1.11.13",                                 // serialization/chart-utils 시간 변환
  "dotenv": "^16.4.5",
  "lightweight-charts": "^4.2.0",
  "pg": "^8.20.0"
  // 기존: next, react, react-dom, zustand 유지
},
"devDependencies": {
  "@types/pg": "^8.20.0"   // 신규
}
```

설치 후 `pnpm install` (워크스페이스 링크).

---

## 3. Fork 매니페스트 — data-view → chart-review (동일 상대 경로로 복사)

> 아래 파일을 `apps/data-view/src/...` → `apps/chart-review/src/...` 같은 경로로 복사한다.
> CSS module(`*.module.css`)이 있으면 함께 복사. import 경로(`@/...`)는 동일 alias라 대부분 그대로 동작.

### 3.1 차트 렌더링 컴포넌트
```
components/chart/RealMinuteChart.tsx
components/chart/RealDailyChart.tsx
components/chart/shell/useChartShell.ts
components/chart/shell/useCrosshairTooltip.ts
components/chart/shell/tooltipUtils.ts
components/chart/tooltip/ChartTooltip.tsx        (+ .module.css)
components/chart/tooltip/MinuteTooltip.tsx       (+ .module.css)
components/chart/tooltip/DailyTooltip.tsx        (+ .module.css)
components/chart/tooltip/ThemeRowList.tsx        (OverlayTooltipRow 타입 — MinuteTooltip이 사용)
components/chart/hooks/useMinuteChartSeries.ts
components/chart/hooks/useMinuteChartData.ts
components/chart/hooks/useMinuteChartMarkers.ts
components/chart/hooks/useMinuteChartPriceLines.ts
```

### 3.2 lib
```
lib/chart/mappers.ts      (toDailyChartCandle, buildMinuteCandles)
lib/chart/overlay.ts      (assignSeriesColors, buildThemeOverlayForBundle)
lib/chart/priceLines.ts   (buildPriceLineOptions, computePriceLineChartValue)
lib/colors.ts             (OVERLAY_SELF_COLOR, OVERLAY_PEER_PALETTE)
lib/constants.ts          (AMOUNT_MIL_TO_EOK)
lib/serialization.ts      (composeUnix, dateToUnix)
lib/result.ts             (Result, okResult, errResult)
```

### 3.3 types / 데이터 연결
```
types/chart.ts                  (DailyCandle, MinuteCandle, ChartPreviewDTO 등)
actions/db.ts                   (getDb)  — ★ 전역 풀 변수명을 __chartReviewDbPool 로 변경 (data-view와 충돌 방지)
actions/chartPreview.ts         (fetchChartPreviewAction)  — themes/overlay 가공 포함된 채로 복사 OK
hooks/useChartPreview.ts
providers/QueryProvider.tsx
```

### 3.4 복사하지 않는다 (prune)
```
components/chart/ChartModal.tsx (+ .module.css)        — 새 앱은 인라인 차트, 모달 아님
components/chart/RealThemeOverlayChart.tsx              — overlay/theme view mode 는 여전히 placeholder
components/chart/tooltip/OverlayTooltip.tsx             — overlay 차트 전용
stores/useChartModalStore.ts / usePeerListModalStore    — 모달/피어리스트 미사용
hooks/useFilterState, useShortcut(여기선 미사용)         — 필터/단축키 트랙 아님
deck / peer-list / filter 관련 일체
```

---

## 4. 어댑테이션 (forked 코드가 기대하는 것 재현)

### 4.1 `useUiStore` 대체 — 가장 중요
RealMinuteChart/RealDailyChart 는 `@/stores/useUiStore` 에서 `chartPriceMode`("krx"|"nxt")를 읽는다.
forked 파일을 고치지 말고, chart-review 에 **같은 셀렉터 모양의 store**를 만든다:

```ts
// src/stores/useUiStore.ts (신규, data-view 것을 차트 관련 필드만 축약 복제)
"use client";
import { create } from "zustand";
type ChartPriceMode = "krx" | "nxt";
type UiState = {
  chartPriceMode: ChartPriceMode;
  setChartPriceMode: (m: ChartPriceMode) => void;
};
export const useUiStore = create<UiState>()((set) => ({
  chartPriceMode: "krx",
  setChartPriceMode: (m) => set({ chartPriceMode: m }),
}));
```

> 탐색용 `useReviewStore` 와는 별개로 둔다(차트 표시 상태 vs 탐색 상태 분리). 나중에 단축키로
> KRX/NXT 토글 시 이 store 의 `setChartPriceMode` 를 command 로 감싸면 된다.

### 4.2 KRX/NXT 토글 UI
ReviewHeader 의 controls 영역에 KRX/NXT 토글 버튼 2개 추가 → `useUiStore.setChartPriceMode` 호출.
(data-view ChartModal 헤더의 modeToggle 마크업 참고. 키보드 바인딩은 이번 범위 아님.)

---

## 5. 데이터 흐름 배선

### 5.1 QueryProvider 마운트
`src/app/layout.tsx` 의 body를 `QueryProvider` 로 감싼다(클라이언트 경계). 또는 ReviewWorkspace 상위에.

### 5.2 ReviewWorkspace 에서 차트 조회
```
const chartParams = { stockCode: selectedGroup.stockCode, tradeDate: selectedGroup.tradeDate };
const { data, isLoading } = useChartPreview(chartParams);
const markerTime = composeUnix(selectedGroup.tradeDate, selectedPoint.tradeTime);
```
- 캐시 키는 (stockCode, tradeDate). point(tradeTime) 만 바뀌면 **재조회 없이 markerTime 만 갱신** →
  Point List 클릭이 가볍다(1차에서 깐 replaceState 철학과 일관).

### 5.3 placeholder 교체 (ReviewWorkspace summary 분기)
```
좌측 dailySlot : <RealDailyChart candles={data.daily} />
우측 분봉      : <RealMinuteChart
                   candles={data.minute}
                   markerTime={markerTime}
                   themeOverlay={[]}            // overlay 는 v2 범위 아님 → 빈 배열(self 툴팁만)
                   prevCloseKrx={data.prevCloseKrx}
                   prevCloseNxt={data.prevCloseNxt}
                 />
```
- `priceLines` 는 chart-review 에 개념이 없으므로 전달하지 않음(undefined).
- minute/daily view mode(단일 크게 보기)에도 같은 컴포넌트 재사용.
- `isLoading` / data 없음(`!data` 또는 빈 candles) 상태 처리: 기존 placeholder를 로딩/빈 상태 박스로 재활용.

---

## 6. tradeTime 포맷 정합성 (★ 1차 검토에서 발견된 봉합선)

- mock tradeTime 은 `HH:MM`("09:34"), data-view 의 `composeUnix` 입력 기대 포맷을 **반드시 확인**하고
  맞춘다(데이터뷰는 `HH:MM:SS` 계열 사용). 불일치 시 markerTime 이 어긋난다.
- 권장: mock tradeTime 을 `composeUnix` 가 받는 포맷으로 정규화하거나, `composeUnix` 호출 직전
  `tradeTime.length === 5 ? tradeTime + ":00" : tradeTime` 식으로 보정.
- URL path param 의 time 도 같은 포맷이어야 seed 매칭(`resolveInitialSelection`)이 맞는다.

---

## 7. DB 연결 & mock 종목 (★ 실차트가 비어 보이는 함정)

- chart-review 가 이제 **DB 연결 앱**이 된다. 루트 `.env` 의 `DATABASE_URL` 필요(`actions/db.ts`).
- mock SheetRows 의 (stockCode, tradeDate) 가 **DB에 실제 캔들이 있는 값**이어야 차트가 렌더된다.
  → mock 의 종목코드/날짜를 DB에 존재하는 실데이터로 교체할 것(임의의 005930/2026-05-29 가 DB에
  없으면 빈 차트). data-view 에서 동작 확인된 (종목, 날짜) 한두 개를 골라 mock 에 반영.

---

## 8. 범위 밖 (이번에도 안 함)

```
- Google Sheets API (리스트는 여전히 mock)
- DB manual 저장 / 저장 버튼
- 테마 전환 (대표 테마 외) — DB 조회 필요, 다음 트랙
- overlay / theme view mode 실제 구현 (placeholder 유지)
- RealThemeOverlayChart / 분봉 오버레이 시리즈 (themeOverlay=[] 로 비활성)
- 단축키 바인딩 (KRX/NXT·tab 토글은 클릭만)
- priceLines
- 분봉 marker 클릭 이동
```

---

## 9. 완료 조건 (Acceptance)

```
1.  pnpm --filter @trade-data-manager/chart-review type-check 통과
2.  pnpm --filter @trade-data-manager/chart-review test 통과 (기존 groupSheetRows 테스트 유지)
3.  /review/[code]/[date]/[time] 에서 우측에 실제 분봉(lightweight-charts) 렌더
4.  좌측 상단에 실제 일봉 렌더
5.  Point List 클릭으로 point 변경 시 분봉 markerTime 이 갱신됨 (차트 재조회 없이)
6.  Prev/Next Stock 으로 group 이동 시 새 (stockCode,tradeDate) 차트가 조회·렌더됨
7.  KRX/NXT 토글로 가격 기준이 전환됨 (분봉·일봉 모두)
8.  분봉/일봉 view mode 에서도 동일 차트가 크게 렌더됨
9.  로딩 / 데이터 없음 상태가 빈 박스로 처리됨 (크래시 없음)
10. ChartModal / 모달 흔적 없이 전부 인라인으로 동작
11. data-view 는 무수정 (fork = 복사이며 원본 변경 아님)
```

---

## 10. 구현 순서 권장

```
1. deps 추가 + pnpm install + workspace 링크 확인
2. types/chart.ts, lib/*(chart/colors/constants/serialization/result) 복사 → type-check
3. actions/db.ts(풀 변수명 변경) + chartPreview.ts + hooks/useChartPreview + QueryProvider 복사
4. useUiStore(축약) 생성
5. components/chart/* 전체 복사 → type-check (누락 import 추적해 보강)
6. layout 에 QueryProvider 마운트
7. ReviewWorkspace placeholder → Real* 차트로 교체 + useChartPreview 배선
8. tradeTime 포맷 보정(6절) + mock 종목을 DB 실데이터로 교체(7절)
9. 수동 확인: 차트 렌더 / point 마커 / group 이동 / KRX·NXT
```
