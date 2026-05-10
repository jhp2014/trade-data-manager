# 차트 지표(Indicator) 추가 가이드

## 추가해야 하는 파일

| 파일 | 내용 |
|------|------|
| `src/components/chart/indicators/<name>.ts` | `ChartIndicator` 구현체 1개 |

## 수정해야 하는 파일

지표를 특정 차트에 연결하려면 해당 차트 컴포넌트(`RealDailyChart`, `RealMinuteChart` 등)의 `useEffect` 내에서 `attach` / `detach` 를 호출합니다.

## ChartIndicator 인터페이스

```ts
interface ChartIndicator<TData, TParams = void> {
    id: string;
    label: string;
    defaultParams?: TParams;
    /** chart 인스턴스에 시리즈/프라이스라인 등을 부착하고 핸들을 반환 */
    attach(chart: IChartApi, params: TParams): IndicatorHandle;
    /** 데이터 변경 시 핸들에 업데이트 */
    update(handle: IndicatorHandle, data: TData): void;
    /** 컴포넌트 언마운트 또는 지표 제거 시 cleanup */
    detach(handle: IndicatorHandle, chart: IChartApi): void;
}
```

## 예제: 수평 기준선 추가

### 1. Indicator 파일 작성

실제 구현 예시는 `src/components/chart/indicators/horizontalLine.ts` 를 참조합니다.

```ts
// src/components/chart/indicators/myIndicator.ts
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { ChartIndicator, IndicatorHandle } from "./types";

interface MyParams { threshold: number }

interface MyHandle extends IndicatorHandle {
    series: ISeriesApi<"Line">;
}

export const myIndicator: ChartIndicator<never, MyParams> = {
    id: "myIndicator",
    label: "내 지표",

    attach(chart: IChartApi, params: MyParams): MyHandle {
        const series = chart.addLineSeries({ priceScaleId: "right" });
        // 시리즈 데이터 설정...
        return { series } as MyHandle;
    },

    update(_handle, _data) {
        // 데이터 변경 시 업데이트 로직
    },

    detach(handle: IndicatorHandle, chart: IChartApi) {
        const h = handle as MyHandle;
        chart.removeSeries(h.series);
    },
};
```

### 2. 차트 컴포넌트에서 사용

`RealDailyChart.tsx` 의 시리즈 생성 `useEffect` 내에서 attach / detach 합니다.

```ts
useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const handle = myIndicator.attach(chart, { threshold: 5 });

    return () => {
        myIndicator.detach(handle, chart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

데이터가 변경될 때 업데이트가 필요하면 데이터 갱신 `useEffect` 에서 `update` 를 호출합니다.

---

## 실전 예시: 가격 라인 목록 (`priceLineList`)

`src/components/chart/indicators/priceLineList.ts`는 단일 시리즈가 아닌 **다중 Price Line**을 관리하는 indicator입니다.

### 단일 시리즈가 아닌 다중 항목을 다루는 패턴

```ts
interface PriceLineListHandle extends IndicatorHandle {
    series: ISeriesApi<"Line">;   // 앵커 시리즈 1개 (visible: false)
    lines: IPriceLine[];           // 동적 개수의 가격 라인
}

export const priceLineListIndicator = {
    attach(chart, params): PriceLineListHandle {
        const series = chart.addLineSeries({ visible: false, priceScaleId: "right" });
        const lines = buildLines(series, params.priceLines, params.prevClose, params.asPrice);
        return { series, lines };
    },

    update(handle, params) {
        const h = handle as PriceLineListHandle;
        // 기존 라인 제거 후 재생성 (라인 수가 적어 비용 무시 가능)
        for (const line of h.lines) h.series.removePriceLine(line);
        h.lines = buildLines(h.series, params.priceLines, params.prevClose, params.asPrice);
    },

    detach(handle, chart) {
        const h = handle as PriceLineListHandle;
        for (const line of h.lines) h.series.removePriceLine(line);
        chart.removeSeries(h.series);
    },
};
```

### 핵심 포인트

- `IPriceLine`은 `ISeriesApi.createPriceLine()`이 반환하며, 시리즈를 통해 제거(`removePriceLine`)해야 합니다.
- 앵커 시리즈(`visible: false`)는 price line을 attach하기 위한 용도로만 사용합니다.
- 핸들에 `lines: IPriceLine[]` 배열을 저장해 `detach`에서 모두 정리합니다.
- `update`에서 기존 라인 전부 제거 후 재생성하는 방식은, 라인 수가 적고 업데이트 빈도가 낮을 때 가장 단순하고 안전합니다.

### params에 변환 로직 포함

일봉(가격 그대로)과 분봉(% 변환)을 하나의 indicator로 처리하기 위해 `asPrice: boolean`과 `prevClose: number | null`을 params로 받습니다. 변환은 indicator 내부에서 완결됩니다.

```ts
const chartValue = asPrice
    ? price
    : prevClose != null ? ((price - prevClose) / prevClose) * 100 : null;
```

---

## 검증 방법

1. `pnpm dev` 로 서버를 시작합니다.
2. 종목을 클릭해 차트 모달을 열고 해당 지표가 렌더링되는지 확인합니다.
3. 다른 종목으로 전환할 때 지표가 올바르게 업데이트/제거되는지 확인합니다.
4. 모달을 닫고 다시 열어도 메모리 누수 없이 정상 동작하는지 확인합니다.

## 흔한 실수

- `detach` 에서 `chart.removeSeries()` 를 빠뜨리면 모달을 반복 열고 닫을 때 시리즈가 누적됩니다.
- `attach` 에서 반환하는 핸들에 모든 참조를 담아야 `detach` 에서 완전히 정리할 수 있습니다.
- `update` 는 데이터 변경마다 호출되므로 비용이 큰 연산은 메모이제이션을 고려하세요.
