# 차트 지표(Indicator) 추가 가이드

## 수정해야 하는 파일

| 파일 | 할 일 |
|------|-------|
| `src/components/chart/indicators/index.ts` | `DAILY_INDICATORS` / `MINUTE_INDICATORS` 배열에 1줄 추가 |

## 추가해야 하는 파일

| 파일 | 내용 |
|------|------|
| `src/components/chart/indicators/<name>.ts` | `ChartIndicator` 구현체 1개 |

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
    detach(handle: IndicatorHandle): void;
}
```

## 예제: 수평 기준선 추가

### 1. Indicator 파일 작성

```ts
// src/components/chart/indicators/horizontalLine.ts
import type { IChartApi, IPriceLine, ISeriesApi } from "lightweight-charts";
import { LineStyle } from "lightweight-charts";
import type { ChartIndicator, IndicatorHandle } from "./types";

interface HLineParams {
    price: number;
    color?: string;
    title?: string;
}

interface HLineHandle extends IndicatorHandle {
    priceLine: IPriceLine;
    series: ISeriesApi<"Line">;
}

export const horizontalLineIndicator: ChartIndicator<never, HLineParams> = {
    id: "horizontalLine",
    label: "수평 기준선",

    attach(chart, params): HLineHandle {
        // 임시 라인 시리즈를 앵커로 사용 (lightweight-charts API 제약)
        const series = chart.addLineSeries({ visible: false, priceScaleId: "right" });
        const priceLine = series.createPriceLine({
            price: params.price,
            color: params.color ?? "rgba(251,191,36,0.8)",
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: true,
            title: params.title ?? "",
        });
        return { priceLine, series };
    },

    update(_handle, _data) {
        // 수평선은 데이터 변경에 무반응
    },

    detach(handle: HLineHandle) {
        // series 제거 시 priceLine 도 함께 제거됨
        handle.series.removePriceLine(handle.priceLine);
    },
};
```

### 2. 레지스트리에 등록

`src/components/chart/indicators/index.ts` 의 배열에 한 줄 추가합니다.

```ts
import { horizontalLineIndicator } from "./horizontalLine";

export const DAILY_INDICATORS = [
    candlestickIndicator,
    volumeIndicator,
    horizontalLineIndicator,  // ← 추가
] as const;
```

### 3. 차트 컴포넌트에서 파라미터 전달 (선택)

```tsx
<RealDailyChart
    candles={daily}
    extraIndicators={[
        { indicator: horizontalLineIndicator, params: { price: entryPrice, title: "매수가" } }
    ]}
/>
```

## 검증 방법

1. `pnpm dev` 로 서버를 시작합니다.
2. 종목을 클릭해 차트 모달을 열고 해당 지표가 렌더링되는지 확인합니다.
3. 다른 종목으로 전환할 때 지표가 올바르게 업데이트/제거되는지 확인합니다.
4. 모달을 닫고 다시 열어도 메모리 누수 없이 정상 동작하는지 확인합니다.

## 흔한 실수

- `detach` 에서 시리즈를 제거하지 않으면 모달을 반복 열고 닫을 때 시리즈가 누적됩니다.
- `attach` 에서 반환하는 핸들에 모든 참조를 담아야 `detach` 에서 완전히 정리할 수 있습니다.
- `update` 는 데이터 변경마다 호출되므로 비용이 큰 연산은 메모이제이션을 고려하세요.
