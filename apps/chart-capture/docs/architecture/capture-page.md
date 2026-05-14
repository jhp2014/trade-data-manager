> 이 문서가 답하려는 질문: Next 페이지와 Playwright가 어떻게 협력해서 정확한 시점에 스크린샷을 찍는가?

# Capture Page + Ready Signal

---

## 개요

`/capture/[stockCode]/[tradeDate]/[variant]` 라우트는 세 단계로 동작한다.

1. **서버 컴포넌트** (`page.tsx`): DB에서 데이터를 조회하고, 불가능한 조합은 즉시 empty 마커를 반환한다.
2. **클라이언트 컴포넌트** (`ChartCaptureClient.tsx`): 차트를 렌더링하고, 라인 데이터가 주입되면 ready signal을 설정한다.
3. **Playwright** (`playwrightDriver.ts`): 정해진 선택자와 window 변수를 통해 페이지와 통신하고 스크린샷을 찍는다.

---

## 서버 컴포넌트 흐름 (`page.tsx`)

1. `params.stockCode`가 6자리 숫자, `params.tradeDate`가 `YYYY-MM-DD`, `params.variant`가 `KRX` 또는 `NXT`인지 검증한다. 실패 시 `notFound()`.
2. `variant === "NXT"`이고 `stock.isNxtAvailable === false`이면 `<div data-empty="true" data-reason="nxt-not-supported">` 반환.
3. `fetchChartData(db, { stockCode, tradeDate, dailyLookbackDays })`로 일봉·분봉을 조회한다.
4. 분봉이 0건이면 `<div data-empty="true" data-reason="no-minute-data">` 반환. (휴장일 등)
5. `toDailyChartCandle`, `buildMinuteCandles`, `fillMissingMinuteCandles`로 DB raw → 차트 타입 변환.
6. `tradeDate`에 해당하는 `entryCandle`을 찾아 `prevCloseKrx`, `prevCloseNxt`를 추출한다.
7. `ChartCaptureClient`에 `daily`, `minute`, `variant`, `prevCloseKrx`, `prevCloseNxt`, `captureBoxW`, `captureBoxH`를 전달한다.

---

## 클라이언트 컴포넌트 흐름 (`ChartCaptureClient.tsx`)

1. **마운트 직후**: `document.body.setAttribute("data-pre-ready", "true")` — Playwright에게 페이지가 준비됐음을 알린다.
2. **라인 데이터 수신**:
   - `window.__CAPTURE_LINES__`가 이미 설정되어 있으면 즉시 사용.
   - 없으면 `capture-lines-ready` 이벤트 리스닝.
   - 2초 fallback 타이머로 lines가 도착하지 않으면 빈 배열로 진행 (외부 서버 디버깅용, 정상 흐름에서는 발화하지 않음).
3. **ready 조건**: `dailyReady && minuteReady && lines !== null` 모두 충족 시 `requestAnimationFrame` 2회 후 `window.__CHART_READY__ = true`.

---

## Playwright와의 계약

```
Playwright                          Next Page
    |                                   |
    |-- goto(url) ---------------------->|
    |                    (networkidle)   |
    |<-- data-pre-ready OR data-empty --|
    |                                   |
    | (data-empty 이면 skip 반환)        |
    |                                   |
    |-- page.evaluate(lines injection)->|
    |   window.__CAPTURE_LINES__ = []   |
    |   dispatch("capture-lines-ready") |
    |                                   |
    |<-- window.__CHART_READY__ = true -|
    |                                   |
    |-- #capture-root screenshot ------>|
    |<-- PNG saved ---------------------|
```

- `Promise.race([waitForSelector('[data-pre-ready="true"]'), waitForSelector(emptySelector)])`: 둘 중 먼저 나타나는 쪽을 감지한다.
- `page.evaluate`로 `window.__CAPTURE_LINES__`를 설정하고 `capture-lines-ready` 이벤트를 dispatch한다.
- `page.waitForFunction(config.readySignal)`: 기본값 `() => !!window.__CHART_READY__`.
- `page.locator("#capture-root").screenshot({ path: job.outputPath })`.


### page.goto의 `waitUntil`

`page.goto`는 항상 `waitUntil: "load"`를 사용한다. ready 판단은 위 셀렉터·`__CHART_READY__` 신호가 책임지므로 `networkidle`은 사용하지 않는다. 이유와 대안 검토는 [ADR-006](../decisions/006-goto-load-and-explicit-ready.md)을 참고한다.

타임아웃 기본값은 다음과 같으며 환경변수로 오버라이드할 수 있다.

- `navTimeoutMs`: 60000ms (`CAPTURE_NAV_TIMEOUT_MS`) — `page.goto`의 timeout.
- `readyTimeoutMs`: 30000ms (`CAPTURE_READY_TIMEOUT_MS`) — pre-ready/empty race와 `waitForFunction`의 timeout. dev 모드 첫 컴파일을 수용하기 위한 기본값.

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|------------|
| `src/app/capture/[stockCode]/[tradeDate]/[variant]/page.tsx` | 서버 컴포넌트, DB 조회, empty 처리 | `CapturePage` (default) |
| `src/app/capture/[stockCode]/[tradeDate]/[variant]/ChartCaptureClient.tsx` | 클라이언트 컴포넌트, ready signal | `ChartCaptureClient` |
| `src/pipeline/playwrightDriver.ts` | Playwright 제어, 라인 주입, 스크린샷 | `createPlaywrightDriver`, `captureJob` |
| `src/data/fetchChartData.ts` | DB에서 일봉·분봉 조회 | `fetchChartData` |
| `src/lib/mappers.ts` | DB raw → 차트 타입 변환 | `toDailyChartCandle`, `buildMinuteCandles` |
| `src/lib/chartPadding.ts` | 분봉 누락 시간 padding | `fillMissingMinuteCandles` |

---

## 설계 결정

- `page.evaluate`로 라인 데이터 주입 → [ADR-002](../decisions/002-page-evaluate-line-injection.md)
- NXT 미지원 종목 skip → [ADR-003](../decisions/003-nxt-skip-not-fallback.md)
- page.goto는 `load` + 명시적 ready signal 조합 → [ADR-006](../decisions/006-goto-load-and-explicit-ready.md)

---

## 확장 포인트

- **새 empty 이유 추가**: `page.tsx`에서 `data-reason` 속성값을 추가하고, 필요 시 `playwrightDriver.ts`에서 해당 reason을 별도 처리한다.
- **ready signal 변경**: `capture.config.ts`의 `readySignal`을 수정한다. 차트 컴포넌트의 `__CHART_READY__` 설정 로직도 함께 맞춘다.
- **데이터 전달 방식 변경**: 현재는 `page.evaluate` + window 변수. URL query나 API 방식으로 변경 시 [ADR-002](../decisions/002-page-evaluate-line-injection.md)를 먼저 검토한다.
