> 이 파일이 답하려는 질문: 차트에 새 지표(수평선, 보조 시리즈 등)를 어떻게 추가하는가?

# 차트 지표 추가 가이드

## 현재 구조

`ChartIndicator` 인터페이스와 `indicators/` 디렉터리는 **ADR-016**에 의해 제거되었다. anchor lineSeries에 `createPriceLine()`을 부착하는 패턴이 lightweight-charts에서 좌표 계산 실패를 유발했기 때문이다.

현재 가격 라인 로직은 각 차트 컴포넌트에 인라인되어 있으며, 공유 순수 함수는 `src/lib/chart/priceLines.ts`에 위치한다.

---

## 새 수평 가격 라인 추가

가격 라인은 **반드시 데이터가 있는 시리즈(candleSeriesRef)에** `createPriceLine()`을 호출해야 한다.

```ts
// RealDailyChart.tsx 또는 RealMinuteChart.tsx 내부
const priceLineHandlesRef = useRef<IPriceLine[]>([]);

useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    // 기존 라인 제거
    for (const line of priceLineHandlesRef.current) {
        try { candleSeries.removePriceLine(line); } catch { /* noop */ }
    }
    priceLineHandlesRef.current = [];

    // 새 라인 생성
    const handle = candleSeries.createPriceLine({
        price: targetPrice,
        color: "#f59e0b",
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: "목표가",
    });
    priceLineHandlesRef.current.push(handle);
}, [targetPrice]);
```

---

## 새 보조 시리즈 추가

보조 시리즈(히스토그램, 라인 등)는 마운트 1회 useEffect 안에서 생성하고 ref에 저장한다. 데이터는 별도 useEffect에서 `series.setData()`로 갱신한다.

```ts
const auxSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

// 마운트 1회
useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const auxSeries = chart.addLineSeries({ priceScaleId: "right" });
    auxSeriesRef.current = auxSeries;
    return () => { auxSeriesRef.current = null; };
}, []);

// 데이터 갱신
useEffect(() => {
    auxSeriesRef.current?.setData(data.map(d => ({ time: d.time as Time, value: d.value })));
}, [data]);
```

---

## 참고

- [ADR-015](./decisions/015-csv-line-prefix-price-line.md) — 가격 라인 컬럼 도입
- [ADR-016](./decisions/016-remove-indicator-abstraction.md) — ChartIndicator 추상화 제거 이유
- `src/lib/chart/priceLines.ts` — 색상·값 변환·옵션 빌더 순수 함수
