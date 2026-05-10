# ADR-001: chart-capture를 data-view와 별도 앱으로 분리

## 상태

Accepted

---

## 맥락

차트를 PNG로 캡처하는 기능을 구현할 때 기존 `data-view` 앱을 재사용할지, 별도 앱을 만들지 결정해야 했다. data-view는 hover tooltip, 필터 UI, 모달, KRX/NXT 토글 등 인터랙티브 기능이 많고, 캡처용 차트는 정적 출력만 필요해 요구사항이 근본적으로 다르다. 두 용도를 같은 앱에 담으면 서로의 요구사항이 충돌할 위험이 있었다.

---

## 검토한 대안

**A. `packages/chart-ui` 공통 패키지 추출**
- 장점: DailyChart, MinuteChart 코드를 한 곳에서 관리.
- 기각 이유: 두 앱의 차트가 요구사항(인터랙션 여부, 색상 옵션, priceLine 라벨 등)에서 점점 달라지고 있어, 공통 패키지를 추상화하면 두 앱 모두에서 필요 없는 옵션 분기가 늘어난다.

**B. 별도 앱으로 완전 분리 (채택)**
- 장점: 의존성 격리, 변경 영향 최소화, 각 앱의 코드를 단순하게 유지.
- 단점: DailyChart, MinuteChart, priceLines.ts, chartPadding.ts 등 일부 코드 중복.

**C. data-view에 `/capture` 라우트만 추가**
- 기각 이유: data-view의 Playwright, Next 서버 기동 등 CLI 파이프라인 코드가 웹 앱과 뒤섞인다. 캡처 설정(viewport, DPR, timeout 등)이 data-view 설정과 충돌한다.

---

## 결정

별도 앱(`apps/chart-capture`)으로 완전 분리한다. 코드 중복은 있지만 의존성 분리와 변경 영향 격리를 우선한다. 두 앱이 동일한 DB(`@trade-data-manager/data-core`)를 공유하는 것은 허용한다.

---

## 결과

**장점**
- 캡처 앱을 수정해도 data-view에 영향 없음.
- 캡처 전용 설정(viewport, DPR, concurrency, 파일명 템플릿 등)을 자유롭게 변경 가능.
- 차트 컴포넌트가 인터랙션 코드 없이 단순하다.

**단점 / 한계**
- DailyChart, MinuteChart, priceLines.ts, chartPadding.ts, chartTime.ts 등이 두 앱에 유사하게 존재한다.
- 공통 로직(예: high-rate marker 구간)을 변경하면 두 앱을 모두 수정해야 한다.
- 두 앱의 차트가 동시에 자주 변경되는 상황이 반복된다면 `packages/chart-ui` 추출을 재검토한다.

---

## 관련

- 차트 컴포넌트 구조: [`docs/architecture/chart-rendering.md`](../architecture/chart-rendering.md)
- 파이프라인 구조: [`docs/architecture/pipeline.md`](../architecture/pipeline.md)
