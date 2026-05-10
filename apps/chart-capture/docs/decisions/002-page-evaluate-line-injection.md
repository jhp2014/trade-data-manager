# ADR-002: page.evaluate로 라인 데이터 주입

## 상태

Accepted

---

## 맥락

CSV에서 파싱한 가격 라인 데이터(LineSpec 배열)를 Next 캡처 페이지에 전달해야 한다. 라인은 복수의 컬럼·복수의 값을 포함할 수 있어 URL에 담기 부담스럽고, 페이지 렌더링 이후에 Playwright가 주입하는 형태가 파이프라인과 가장 자연스럽게 통합된다.

---

## 검토한 대안

**A. URL query에 base64 JSON**
- `?lines=<base64>` 형태로 전달.
- 기각 이유: URL 길이 제한(브라우저/서버마다 다름), base64 디코딩 에러 처리 복잡, 디버깅 시 URL이 지저분해짐.

**B. page.evaluate로 window 변수 주입 (채택)**
- 페이지 마운트 후 `page.evaluate`로 `window.__CAPTURE_LINES__`를 설정하고 `capture-lines-ready` 이벤트를 dispatch.
- 장점: 깔끔한 URL 유지, 페이로드 크기 제한 없음, Playwright와 자연스러운 통합.

**C. POST API + 토큰**
- 캡처 전에 API로 라인 데이터를 서버에 POST하고, 토큰을 URL에 담아 페이지에서 조회.
- 기각 이유: 구현 복잡도가 높고, 임시 데이터를 서버에 저장하는 것이 불필요한 side effect를 만든다.

---

## 결정

`page.evaluate`로 `window.__CAPTURE_LINES__`를 설정하고 `capture-lines-ready` 이벤트를 dispatch한다. 클라이언트 컴포넌트(`ChartCaptureClient`)는 마운트 시 해당 변수와 이벤트를 리스닝하고, 2초 fallback으로 lines가 도착하지 않으면 빈 배열로 진행한다.

---

## 결과

**장점**
- URL이 `/capture/{stockCode}/{tradeDate}/{variant}` 형태로 단순하다.
- 라인 데이터가 많아도 문제없다.
- Playwright의 기존 `page.evaluate` API를 그대로 활용.

**단점 / 한계**
- 페이지가 마운트된 이후에만 주입 가능하다 (`data-pre-ready` 마커로 타이밍 조율).
- `window.__CAPTURE_LINES__`는 타입 안전성 없음 — `as unknown as` 캐스팅 필요.
- 외부 서버 디버깅 시 라인을 브라우저 콘솔에서 직접 주입해야 한다 (2초 fallback으로 빈 배열 진행 가능).

---

## 관련

- 캡처 페이지 흐름: [`docs/architecture/capture-page.md`](../architecture/capture-page.md)
- 구현 위치: [`src/pipeline/playwrightDriver.ts`](../../src/pipeline/playwrightDriver.ts), [`src/app/capture/.../ChartCaptureClient.tsx`](../../src/app/capture/%5BstockCode%5D/%5BtradeDate%5D/%5Bvariant%5D/ChartCaptureClient.tsx)
