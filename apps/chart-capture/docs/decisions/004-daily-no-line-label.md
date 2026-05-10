# ADR-004: 일봉 차트 priceLine 라벨 제거 (차트 내 텍스트만)

## 상태

Accepted (2026-05-11)

---

## 맥락

일봉 차트의 priceLine에는 컬럼 이름이 라벨로 표시되고 있었다 (`line_s1` → `s1`). 캡처된 PNG에서 이 텍스트가 가격선 위에 겹쳐 보여 차트가 지저분하게 보였다. DigiKam으로 분류 작업 시 핵심 정보는 가격선의 위치(가격)이지 컬럼 이름이 아니었다. 단, 우측 가격 축에 가격이 표시되는 것은 분류에 유용하므로 유지하고 싶었다.

---

## 검토한 대안

**A. `axisLabelVisible: false`로 우측 축까지 모두 숨김**
- 차트 영역 라벨 + 우측 축 가격 모두 제거.
- 기각 이유: 우측 축의 가격은 PNG를 보며 해당 라인의 절대 가격을 빠르게 확인하는 데 유용하다.

**B. `title: ""`로 차트 내 라벨만 제거 (채택)**
- `buildPriceLineOptions(spec.color, "", chartValue)` — label 인자를 빈 문자열로.
- `axisLabelVisible: true`는 그대로 유지해 우측 축에 가격이 표시된다.

**C. 분봉도 동일하게 처리**
- 기각 이유: 분봉의 priceLine은 % 변환된 값이라 같은 가격이 다른 % 값으로 보인다. 컬럼 이름 라벨이 있으면 어떤 라인인지 구분하기 쉬워 의미 전달에 유리하다.

---

## 결정

일봉 차트의 `buildPriceLineOptions` 두 번째 인자(label)를 빈 문자열로 변경한다. 분봉 차트는 기존 컬럼 이름 라벨을 유지한다.

---

## 결과

**장점**
- 일봉 PNG에서 가격선이 깔끔하게 보인다.
- 우측 축에서 각 라인의 원화 가격을 확인 가능.

**단점 / 한계**
- 일봉 차트에서 여러 priceLine이 가까이 있을 때 어느 라인이 무슨 컬럼인지 PNG만으로 알 수 없다. 우측 축 가격으로 간접 구분만 가능.

---

## 관련

- 차트 컴포넌트 구조: [`docs/architecture/chart-rendering.md`](../architecture/chart-rendering.md)
- 구현 위치: [`src/components/chart/DailyChart.tsx`](../../src/components/chart/DailyChart.tsx), [`src/lib/chart/priceLines.ts`](../../src/lib/chart/priceLines.ts)
