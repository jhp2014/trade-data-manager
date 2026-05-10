> 이 파일이 답하려는 질문: ChartIndicator 추상화를 왜 제거했는가?

# ADR-016: ChartIndicator 추상화 제거 및 가격 라인 인라인화

## 상태

Accepted (2026-05-10)

---

## 맥락

ADR-015에서 `priceLineListIndicator`를 `ChartIndicator` 인터페이스를 구현한 플러그인 형태로 작성했다. 이 추상화는 장래에 지표를 여럿 추가할 것을 가정하고 설계되었다.

그러나 실제로 추가된 지표는 `priceLineList` 하나뿐이었고, 더 중요한 문제로 **anchor lineSeries 패턴이 lightweight-charts에서 priceLine 좌표 계산 실패를 유발**했다. `createPriceLine()`이 데이터가 없는 보조 LineSeries에 부착되면 차트 라이브러리가 Y축 좌표를 계산할 수 없어 가격 라인이 화면에 렌더되지 않는다.

`createPriceLine()`은 실제 가격 데이터를 가진 시리즈(캔들 시리즈)에 직접 호출해야 한다.

---

## 검토한 대안

### A. anchor series를 visible=true로 유지하면서 더미 데이터를 넣는다
- 기각: 차트 autoscale 영역에 불필요한 시리즈가 노출되고, 더미 데이터 관리가 복잡해진다.

### B. autoscaleInfoProvider를 통해 좌표 강제 계산
- 기각: lightweight-charts가 보장하는 공개 API가 아니며, 버전 업그레이드 시 동작 변경 위험이 있다.

### C. ChartIndicator 인터페이스를 유지하되 구현 방식을 교체 (handle에 candleSeriesRef를 주입)
- 기각: 인터페이스 계약(`attach(chart, params)`)이 캔들 시리즈 참조를 받는 것을 허용하지 않으며, 이를 허용하도록 확장하면 더 복잡해진다.

### D. 추상화 제거 후 각 차트 컴포넌트에 직접 인라인 (채택)
- 장점: 동작 단순화. 가격 라인이 candleSeriesRef에 직접 붙어 좌표 계산 성공. YAGNI 원칙 적용.

---

## 결정

`ChartIndicator` 인터페이스와 `indicators/` 디렉터리를 제거하고, 가격 라인 로직을 각 차트 컴포넌트에 인라인화한다.

공유 순수 함수(`colorForPriceLineKey`, `stripLinePrefix`, `computePriceLineChartValue`, `buildPriceLineOptions`)는 `src/lib/chart/priceLines.ts`에 분리해 차트 인스턴스 의존 없이 재사용 가능하게 한다.

각 차트 컴포넌트는 `priceLineHandlesRef = useRef<IPriceLine[]>([])` 로 핸들을 직접 관리하며, 의존 배열(`priceLines`, `prevClose`) 변경 시 기존 라인을 모두 제거하고 재생성한다.

---

## 결과

**장점**
- 가격 라인이 실제로 화면에 렌더된다 (핵심 버그 수정).
- 코드 경로가 단순해져 디버깅이 쉬워진다.
- 인터페이스·index 파일·래퍼 계층이 사라져 코드량이 줄었다.

**한계**
- 나중에 지표를 여럿 추가해야 한다면 비슷한 패턴을 직접 구현해야 한다. 그러나 지표 1~2개 수준이면 인라인이 더 명확하다.

---

## 관련

- 제거된 파일: `src/components/chart/indicators/` (types.ts, index.ts, priceLineList.ts, horizontalLine.ts)
- 추가된 파일: `src/lib/chart/priceLines.ts`
- 영향 파일: `src/components/chart/RealDailyChart.tsx`, `src/components/chart/RealMinuteChart.tsx`
- [ADR-015](./015-csv-line-prefix-price-line.md) — 가격 라인 컬럼 도입 결정 (인라인화 전 구현)
