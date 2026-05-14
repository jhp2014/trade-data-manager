# ADR-006: page.goto는 `load` + 명시적 ready signal 조합 사용

## 상태

Accepted (2026-05-14)

---

## 맥락

`capture:dev` 모드(=`next dev`)로 캡처를 실행했을 때 첫 페이지에서 navigation timeout이 반복적으로 발생했다. 원인은 두 가지였다.

1. **HMR WebSocket으로 인한 `networkidle` 미도달**: Next dev 모드는 `/_next/webpack-hmr` WebSocket을 상시 유지한다. Playwright의 `waitUntil: "networkidle"`은 "500ms 동안 네트워크 idle"을 요구하는데, 살아있는 WebSocket이 있으면 이 조건이 구조적으로 충족되지 않는다.
2. **`navTimeoutMs: 15000`이 dev 첫 컴파일에 부족**: dev 모드는 라우트 첫 진입 시 10~30초의 온디맨드 컴파일이 발생한다. 15초 타임아웃은 첫 종목에서 거의 항상 초과된다.

원 코드는 `next start`(prod) 사용을 암묵적으로 전제했지만, 그 가정이 코드에 명시되어 있지 않아 dev 모드 실행 시 비명시적으로 깨졌다.

---

## 검토한 대안

**A. dev/prod 분기: dev면 `load`, prod면 `networkidle`**
- `config.devMode` 값에 따라 `waitUntil`을 바꾼다.
- 기각 이유: 분기가 늘어나고, prod에서도 `networkidle`이 주는 추가 안전 마진은 사실상 없다. 이미 `data-pre-ready` 마커와 `window.__CHART_READY__`라는 명시적 ready 신호가 진짜 게이트 역할을 한다.

**B. 항상 `load` + 명시적 ready signal (채택)**
- `page.goto(url, { waitUntil: "load" })`로 통일.
- 그 뒤 `data-pre-ready`/`emptySelector` race → 라인 주입 → `waitForFunction(__CHART_READY__)` 흐름이 캡처 타이밍을 책임진다.
- 장점: 단일 코드 경로, dev/prod 모두 동작, 의미가 명확("페이지가 로드되면 그 뒤는 우리 신호로 판단").

**C. `waitUntil: "domcontentloaded"`로 더 빠르게**
- 기각 이유: 동기 리소스 로드 전에 진행하면 lightweight-charts 번들 로드 타이밍과 맞물려 race 가능성이 늘어난다. `load`가 적절한 균형점.

---

## 결정

`page.goto`의 `waitUntil`은 항상 `"load"`로 사용한다. 캡처 시점은 다음 두 신호가 책임진다.

1. `[data-pre-ready="true"]` 또는 `[data-empty="true"]` 셀렉터의 등장 (race).
2. `window.__CHART_READY__ === true` (라인 주입 + 두 차트 ready + RAF 2회 후 설정).

또한 dev 모드 첫 컴파일을 고려해 다음 타임아웃 기본값을 적용하고, 환경변수로 오버라이드 가능하게 한다.

- `navTimeoutMs`: 기본 60000ms (`CAPTURE_NAV_TIMEOUT_MS`)
- `readyTimeoutMs`: 기본 30000ms (`CAPTURE_READY_TIMEOUT_MS`)

---

## 결과

**장점**
- dev/prod 모두 동일한 코드 경로로 동작한다.
- HMR WebSocket에 의한 `networkidle` 미도달 문제가 원천 제거된다.
- ready 판단의 책임이 명시적 신호(`__CHART_READY__`)에 단일화된다.

**단점 / 한계**
- `load` 이후 차트가 비정상적으로 ready 신호를 못 띄우는 경우, `networkidle`을 썼다면 자연스럽게 잡혔을 일부 회귀가 `readyTimeoutMs` 초과로 드러난다. 다만 이는 더 정확한 실패 신호로 봐야 한다 — 차트 렌더 로직 자체의 버그를 감추지 않는 편이 낫다.
- dev 모드 첫 컴파일이 60초를 넘는 극단적 환경에서는 환경변수로 더 늘려야 한다.

---

## 관련

- 캡처 페이지 흐름: [`docs/architecture/capture-page.md`](../architecture/capture-page.md)
- 구현 위치: [`src/pipeline/playwrightDriver.ts`](../../src/pipeline/playwrightDriver.ts), [`capture.config.ts`](../../capture.config.ts)
- 운영 권장 사항(prod 기본 사용): [`README.md`](../../README.md)
