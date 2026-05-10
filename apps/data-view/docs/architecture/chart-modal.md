> 이 파일이 답하려는 질문: 행 클릭부터 차트가 그려지기까지 무슨 일이 벌어지는가?

# 차트 모달 (Chart Modal)

## 목적

모달 라이프사이클과 3개 탭 차트 컴포넌트의 공통 셸 구조를 설명한다. 모달이 열리고 닫힐 때 메모리·구독이 어떻게 정리되는지 명확히 파악하기 위한 문서다. hover 툴팁의 세부 단계는 [chart-tooltip.md](./chart-tooltip.md)로 위임한다.

---

## 흐름

### 1. 모달 열기

1. `EntryRow`에서 종목 버튼 클릭 → `useChartModalStore.open({ stockCode, stockName, tradeDate, tradeTime, activePools, priceLines })`. `activePools`는 `derived.activePools`에서 `{ instanceId, memberStockCodes }` 배열로 변환해 동봉한다. `priceLines`는 `entry.priceLines` (CSV의 `line_` prefix 컬럼에서 파싱된 가격 배열). PeerRow에서 열 때는 `priceLines` 없음(undefined).
2. `useChartModalStore`(Zustand)의 `target` 상태가 설정된다.
3. `ChartModal` 컴포넌트가 `target !== null`이므로 마운트된다.
4. 기본 탭은 `"minute"` (마운트 시 `useEffect`로 강제 초기화).
5. `document.body.style.overflow = "hidden"` 적용 (배경 스크롤 방지).

### 2. 데이터 조회 — `useChartPreview`

6. `useChartPreview(target)`가 React Query로 `fetchChartPreviewAction` 서버 액션을 호출한다.
   - queryKey: `["chart-preview", stockCode, tradeDate, tradeTime]`
   - staleTime: QueryProvider 기본값 (5분)
7. 서버 액션 내부 순서:
   - `getDataViewDb()` → DB 연결
   - `getThemeBundle(db, { stockCode, tradeDate })` → 테마 묶음 조회
   - `pickSelfMember(bundles)` → self 멤버 선택
   - `self.daily.map(toDailyChartCandle)` → 일봉 변환 (`DailyCandle`, krx/nxt 중첩 구조)
   - `fillMissingMinuteCandles(buildMinuteCandles(self.minute))` → 분봉 + padding (`MinuteCandle[]`)
   - `buildThemeOverlay(bundles, stockCode)` → 오버레이 시리즈 조립 (self 첫 번째 + peers NXT 등락률 내림차순, MAX 15개)
   - `composeUnix(tradeDate, tradeTime)` → 진입 마커 시각
   - 진입일 일봉에서 `prevCloseKrx` / `prevCloseNxt` 추출 (분봉 가격 라인 % 변환 기준값)
8. `ChartPreviewDTO` 반환. React Query가 캐싱하므로 같은 종목/날짜/시각 재조회는 네트워크 요청 없이 즉시 반환.

### 3. KRX/NXT 모드 토글 (ADR-014)

- `useUiStore.chartPriceMode` ("krx" | "nxt") 를 세 차트 컴포넌트 모두 구독한다.
- 토글 UI는 **모달 헤더**에 위치하며, 탭 그룹 왼쪽에 배치된다.
- 탭 전환 시 모드 유지. localStorage에 persist (version 2, 기존 `dailyChartPriceMode` 값 마이그레이션).
- 일봉: `DailyCandle.krx.*` 또는 `.nxt.*` OHLC를 사용. 고가 마커 분모는 항상 KRX 전일종가.
- 분봉: `MinuteCandle.krx.*` 또는 `.nxt.*` OHLC 사용. 가격 라인 % 변환도 모드별 prevClose 기준.
- 오버레이: `ChartOverlayPoint.valueKrx` 또는 `.valueNxt` 사용. peers 정렬 기준은 NXT 고정(모드 불변).

### 4. 탭별 차트 렌더

모달 body에서 현재 `tab` 상태에 따라 하나의 차트만 렌더된다 (나머지는 언마운트):

| 탭 | 컴포넌트 | 주요 props |
|----|---------|--------|
| `minute` | `RealMinuteChart` | `candles`, `markerTime`, `themeOverlay`, `priceLines`, `prevCloseKrx`, `prevCloseNxt` |
| `daily` | `RealDailyChart` | `candles`, `priceLines` |
| `overlay` | `RealThemeOverlayChart` | `data`, `markerTime`, `activePredicateInstances`, `activePools` |

### 5. 가격 라인 (ADR-015, ADR-016)

`priceLines` prop이 있을 때 각 차트 컴포넌트가 **`candleSeries.createPriceLine()`을 직접 호출**해 수평선을 부착한다:
- 일봉: 가격 그대로 수평선. title 형식 `"label 가격"`.
- 분봉: mode별 `prevClose` 기준으로 `% = (price - prevClose) / prevClose * 100` 변환. title 형식 `"label ±x.xx%"`. `prevClose`가 null이거나 ≤0이면 라인 미표시.
- 컬럼명에서 `line_` prefix를 제거한 문자열이 라인 label로 사용된다.
- 오버레이 차트에는 미적용.
- `priceLineHandlesRef = useRef<IPriceLine[]>([])` 로 핸들을 관리. 의존 배열 변경 시 기존 라인 제거 후 재생성.
- 순수 함수(`colorForPriceLineKey`, `computePriceLineChartValue`, `buildPriceLineOptions`)는 `src/lib/chart/priceLines.ts`에 분리됨.

### 6. 각 차트 컴포넌트의 공통 셸 구조

모든 차트 컴포넌트는 다음 4단계 useEffect 패턴을 따른다:

```
1. useChartShell(containerRef, makeOptions)
   → createChart + ResizeObserver + cleanup (chart.remove)

2. useEffect([], []) — 시리즈 생성 (마운트 1회)
   → chart.addCandlestickSeries / addLineSeries / addHistogramSeries
   → 시리즈 ref에 저장

3. useCrosshairTooltip({ chartRef, containerRef, render, leftOffset })
   → subscribeCrosshairMove + RAF throttle + ReactNode 상태 관리

4. useEffect([data, mode]) — 데이터 갱신
   → series.setData(...)
   → markers 설정
   → timeScale().fitContent()
```

### 7. 키보드 단축키

`useShortcut`으로 다음 단축키가 모달이 열린 동안만 활성화된다:

| 키 | 동작 |
|----|------|
| `Esc` | 모달 닫기 |
| `Space` | 다음 탭으로 순환 (`minute → daily → overlay → minute`) |
| `1` / `2` / `3` | 각각 `minute` / `daily` / `overlay` 탭으로 점프 |

### 8. 모달 닫기 — 정리 순서

1. `useChartModalStore.close()` → `target = null`.
2. `ChartModal`이 `target === null`이므로 `return null` (언마운트).
3. 각 차트 컴포넌트 언마운트 → `useEffect` cleanup 역순 실행:
   - `useCrosshairTooltip`: `cancelAnimationFrame` + `pendingRef = null` + state 초기화
   - 시리즈 ref: `null` 설정
   - `useChartShell`: `ro.disconnect()` + `chart.remove()` (모든 구독 자동 해제)
4. `body.overflow` 복원.

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|-------------|
| `src/components/chart/ChartModal.tsx` | 모달 셸, 탭 관리, KRX/NXT 토글, 키보드 | `ChartModal` |
| `src/components/chart/RealMinuteChart.tsx` | 분봉 차트 (KRX/NXT % OHLC + 통합 툴팁 + 가격 라인) | `RealMinuteChart` |
| `src/components/chart/RealDailyChart.tsx` | 일봉 차트 (KRX/NXT OHLCV + 고가 마커 + 가격 라인) | `RealDailyChart` |
| `src/components/chart/RealThemeOverlayChart.tsx` | 테마 오버레이 (KRX/NXT 등락률 라인, peers 정렬 NXT 고정) | `RealThemeOverlayChart` |
| `src/components/chart/shell/useChartShell.ts` | 차트 생성·ResizeObserver·정리 | `useChartShell` |
| `src/hooks/useChartPreview.ts` | React Query 래퍼 | `useChartPreview` |
| `src/stores/useChartModalStore.ts` | 모달 open/close 상태 (priceLines 포함) | `useChartModalStore` |
| `src/stores/useUiStore.ts` | chartPriceMode persist (version 2) | `useUiStore` |
| `src/actions/chartPreview.ts` | 서버 액션 진입점 (prevCloseKrx/Nxt 포함) | `fetchChartPreviewAction` |
| `src/lib/chart/mappers.ts` | raw row → DailyCandle / MinuteCandle 변환 | `toDailyChartCandle`, `buildMinuteCandles` |
| `src/lib/chart/overlay.ts` | 테마 오버레이 조립 + 색상 | `buildThemeOverlay`, `assignSeriesColors` |
| `src/lib/chartPadding.ts` | 빈 분봉·오버레이 포인트 채우기 | `fillMissingMinuteCandles`, `fillMissingOverlayPoints` |
| `src/lib/chart/priceLines.ts` | 가격 라인 순수 함수 (색상·값 변환·옵션 빌더) | `colorForPriceLineKey`, `computePriceLineChartValue`, `buildPriceLineOptions` |

---

## 설계 결정

- **차트 셸 훅 추출 이유** — 세 차트 컴포넌트 모두 `createChart`, `ResizeObserver`, `chart.remove` 코드가 동일했다. `useChartShell`로 추출해 중복을 제거하고, 차트 컴포넌트는 시리즈 생성과 데이터 바인딩에만 집중한다.

- **분봉 padding 정책 (옵션 B)** — 거래 없는 분을 직전 봉의 close로 채워 lightweight-charts가 시간축을 연속으로 표시하게 한다. 첫 봉 이전/마지막 봉 이후는 채우지 않는다. → [ADR-003](../decisions/003-chartpadding-option-b.md)

- **오버레이 시리즈 정렬·색상 정책** — self가 항상 검정색(`SELF_COLOR = "#000000"`) 굵은 선으로 고정되고, peers는 마지막 시점 NXT 등락률 내림차순으로 `PALETTE` 색상을 순서대로 부여받는다. `assignSeriesColors` 함수로 분봉·오버레이 두 차트가 동일한 색상 매핑을 공유한다. → `src/lib/chart/overlay.ts`

- **KRX/NXT 토글 통합** — 일봉 내부 토글을 제거하고 모달 헤더로 이동. 세 차트가 동일한 `chartPriceMode`를 공유하여 탭 전환 시 모드가 유지된다. → [ADR-014](../decisions/014-unified-chart-mode-toggle.md)

- **타입 분리** — `ChartCandle` 하나에서 `DailyCandle`(가격) / `MinuteCandle`(% 등락률) 로 분리. NXT 필드 충돌 해소. → [ADR-013](../decisions/013-chart-candle-type-split.md)

- **가격 라인 컬럼** — CSV의 `line_` prefix 컬럼은 optionKeys와 분리되어 `priceLines`로 전달. 차트에 수평선으로 표시. → [ADR-015](../decisions/015-csv-line-prefix-price-line.md)

- **가격 라인 인라인화** — `ChartIndicator` 추상화와 anchor lineSeries 패턴이 priceLine 좌표 계산 실패를 유발해 제거. `candleSeries`에 직접 `createPriceLine()` 호출로 변경. → [ADR-016](../decisions/016-remove-indicator-abstraction.md)

- **tooltip을 React로 포팅한 이유** → [ADR-002](../decisions/002-chart-tooltip-react.md)

---

## 확장 포인트

- **새 차트 탭 추가** — `TAB_ORDER`에 새 탭 키 추가 + `TAB_LABEL` 매핑 추가 + 해당 컴포넌트 작성. 컴포넌트는 `useChartShell` + `useCrosshairTooltip` 조합으로 구성하면 기존 패턴과 일치.
- **새 차트 지표 추가** — [adding-chart-indicator.md](../adding-chart-indicator.md) 위임.
- **모달을 URL 기반으로 만들기** — 현재 Zustand 상태 기반. URL 파라미터로 변경하면 공유 가능한 링크가 생기지만, 서버 컴포넌트 패치 없이 클라이언트 전용 상태를 nuqs로 교체하는 방식이 가장 간단.
