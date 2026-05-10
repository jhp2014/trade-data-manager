> 이 문서가 답하려는 질문: DailyChart / MinuteChart 컴포넌트는 어떤 구조로 동작하고, ready signal은 언제 발생하는가?

# 차트 컴포넌트 구조

---

## 개요

`DailyChart`와 `MinuteChart`는 lightweight-charts 기반의 캡처 전용 컴포넌트다. data-view의 동일 이름 컴포넌트와 의도적으로 분리되어 있으며([ADR-001](../decisions/001-separate-from-data-view.md)), hover/tooltip/modal 등 인터랙티브 기능을 모두 제거한 단순화 버전이다.

---

## DailyChart 구조 (`src/components/chart/DailyChart.tsx`)

### 1. 차트 생성 useEffect (의존성: `[]`, 마운트 1회)

- `createChart(container, options)`로 lightweight-charts 인스턴스를 생성한다.
- `candleSeries` (Candlestick): 일봉 OHLC. `priceScaleId: "right"`.
- `amountSeries` (Histogram): 거래대금(억 단위). `priceScaleId: "amount"`, 차트 하단 25%에 표시.
- `ResizeObserver`를 부착해 컨테이너 크기 변경 시 차트를 리사이징한다.

### 2. 데이터 설정 useEffect (의존성: `[candles, variant]`)

- `variant === "NXT"`이면 `c.nxt`, 아니면 `c.krx`를 사용해 OHLC와 거래대금을 설정한다.
- **high-rate marker 생성**:
  - `prevClose = useNxt ? c.prevCloseNxt : c.prevCloseKrx`로 variant별 기준가 선택.
  - `pct = ((high - prevClose) / prevClose) * 100` 계산.
  - `highMarkerColor(pct)`가 null이 아니면 `{ time, position: "aboveBar", color, shape: "circle", text: "+X.X" }` 추가.
  - 전체 순회 후 `candleSeries.setMarkers(markers)` 호출.
- `timeScale().fitContent()`로 전체 캔들이 보이도록 조정.
- `onReady()`를 1회만 호출한다 (`onReadyCalled` ref로 guard).

### 3. priceLine useEffect (의존성: `[priceLines]`)

- 기존 핸들을 `removePriceLine`으로 제거한 후 재생성한다.
- 일봉은 `asPrice: true` → 원화 가격 그대로 사용 (`computePriceLineChartValue`).
- **label은 빈 문자열** (`buildPriceLineOptions(spec.color, "", chartValue)`) — 차트 영역 라벨 없음, 우측 축 가격 표시는 유지([ADR-004](../decisions/004-daily-no-line-label.md)).

---

## MinuteChart 구조 (`src/components/chart/MinuteChart.tsx`)

### 1. 차트 생성 useEffect (의존성: `[]`, 마운트 1회)

- `candleSeries`: 분봉 OHLC. 우측 price scale은 `% formatter` (`+X.XX%`).
- `amountSeries`: 거래대금(억 단위). 좌측 `amount` scale.
- `zeroLine`: 기준선(0%) — `priceScaleId: "right"`, 검정 실선.

### 2. 데이터 설정 useEffect (의존성: `[candles, variant]`)

- prevClose 기준으로 분봉 OHLC를 % 값으로 변환해 설정한다.
- `fitContent` 후 `onReady()` 1회 호출.

### 3. priceLine useEffect (의존성: `[priceLines, prevClose]`)

- `prevClose` 기준으로 가격을 % 변환 (`asPrice: false`).
- label은 `spec.column.replace("line_", "")` — 분봉은 컬럼 이름을 라벨로 유지한다.

---

## 공통 동작

- **`handleScroll: false`, `handleScale: false`**: 캡처 전용이므로 마우스 인터랙션 불필요. 스크린샷 시 레이아웃 변화를 방지한다.
- **색상 규칙**: 상승 `#ef4444`(빨강), 하락 `#3b82f6`(파랑). lightweight-charts의 up/downColor에 적용.
- **`priceLineVisible: false`, `lastValueVisible: false`**: 마지막 종가 기준선·라벨 자동 생성을 끈다.

---

## High-rate Marker 로직 (`src/lib/chart/highMarker.ts`)

| pct 범위 | 색상 |
|---------|------|
| < 10% | null (marker 없음) |
| 10% ~ 15% | `#fbbf24` (황색) |
| 15% ~ 20% | `#fb923c` (주황) |
| 20% ~ 25% | `#ef4444` (빨강) |
| 25% ~ 30% | `#a855f7` (보라) |
| ≥ 30% | `#7c3aed` (남보라) |

- variant별 prevClose를 분모로 사용한다 — KRX 파일은 KRX 기준, NXT 파일은 NXT 기준([ADR-005](../decisions/005-high-rate-marker.md)).

---

## PriceLine 처리 (`src/lib/chart/priceLines.ts`)

- `computePriceLineChartValue(price, prevClose, asPrice)`:
  - `asPrice=true` → 원화 가격 그대로 반환 (일봉).
  - `asPrice=false` → `((price - prevClose) / prevClose) * 100` % 변환 (분봉).
- `buildPriceLineOptions(color, label, chartValue)`:
  - `axisLabelVisible: true` — 우측 축 라벨은 항상 표시.
  - `title: label` — label이 `""`이면 차트 내 텍스트 없음 (일봉, [ADR-004](../decisions/004-daily-no-line-label.md)).

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|------------|
| `src/components/chart/DailyChart.tsx` | 일봉 차트 컴포넌트 | `DailyChart` |
| `src/components/chart/MinuteChart.tsx` | 분봉 차트 컴포넌트 | `MinuteChart` |
| `src/lib/chart/highMarker.ts` | high-rate marker 색상 계산 | `highMarkerColor`, `HIGH_MARKER_MIN_PCT` |
| `src/lib/chart/priceLines.ts` | priceLine 값 계산·옵션 생성 | `computePriceLineChartValue`, `buildPriceLineOptions` |
| `src/lib/chartTypes.ts` | 차트 데이터 타입 | `DailyCandle`, `MinuteCandle` |
| `src/lib/chartPadding.ts` | 분봉 누락 시간 padding | `fillMissingMinuteCandles` |

---

## 설계 결정

- data-view와 별도 컴포넌트 유지 → [ADR-001](../decisions/001-separate-from-data-view.md)
- 일봉 priceLine 라벨 제거 → [ADR-004](../decisions/004-daily-no-line-label.md)
- variant별 prevClose 기준 marker → [ADR-005](../decisions/005-high-rate-marker.md)

---

## 확장 포인트

- **새 시리즈 추가**: 차트 생성 useEffect에 추가하고, 데이터 설정 useEffect에서 데이터를 설정한다. `onReady` guard에 추가 ready 조건이 필요하다면 `ChartCaptureClient.tsx`도 수정한다.
- **marker 색상/구간 변경**: `src/lib/chart/highMarker.ts`의 `highMarkerColor` 함수와 `HIGH_MARKER_MIN_PCT` 상수만 수정하면 된다.
- **분봉 priceLine 라벨 제거**: `MinuteChart.tsx`의 `buildPriceLineOptions` 두 번째 인자를 `""`로 변경한다.
