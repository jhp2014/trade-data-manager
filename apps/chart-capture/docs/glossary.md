# chart-capture 용어집

---

## Capture 관련

| 용어 | 정의 |
|------|------|
| **CaptureJob** | 단일 캡처 작업 단위. stockCode + tradeDate + variant + outputPath + lines 조합. [`src/types/capture.ts`](../src/types/capture.ts) |
| **CaptureCsvRow** | CSV 한 행에 대응하는 파싱 결과. stockCode + tradeDate + LineSpec 배열. [`src/types/capture.ts`](../src/types/capture.ts) |
| **LineSpec** | 가격 라인 1개의 명세. `{ column, values, color }`. [`src/types/capture.ts`](../src/types/capture.ts) |
| **variant** | 시장 구분자. `"KRX"` 또는 `"NXT"`. 같은 종목·날짜도 variant별로 별도 PNG를 생성한다. [`src/types/capture.ts`](../src/types/capture.ts) |
| **readySignal** | Playwright가 캡처 타이밍을 판단하는 JS 조건식. 기본값: `() => !!window.__CHART_READY__`. [`capture.config.ts`](../capture.config.ts) |
| **pre-ready marker** | `<body data-pre-ready="true">` 속성. 페이지가 마운트되자마자 설정되어 Playwright에게 라인 주입 가능 시점을 알린다. [`ChartCaptureClient.tsx`](../src/app/capture/%5BstockCode%5D/%5BtradeDate%5D/%5Bvariant%5D/ChartCaptureClient.tsx) |
| **empty marker** | `<div data-empty="true" data-reason="...">`. 캡처 불가(NXT 미지원, 분봉 없음) 시 반환. Playwright가 감지하면 해당 job을 skip한다. [`page.tsx`](../src/app/capture/%5BstockCode%5D/%5BtradeDate%5D/%5Bvariant%5D/page.tsx) |

---

## CSV 관련

| 용어 | 정의 |
|------|------|
| **inputDir** | 처리 대상 CSV 파일이 들어오는 디렉터리. 설정 가능. [`capture.config.ts`](../capture.config.ts) |
| **processedSubdir** | 성공한 CSV가 이동되는 하위 디렉터리 이름 (기본 `processed`). [`capture.config.ts`](../capture.config.ts) |
| **failedSubdir** | 파싱 실패 CSV가 이동되는 하위 디렉터리 이름 (기본 `failed`). [`capture.config.ts`](../capture.config.ts) |
| **sidecar log** | CSV 처리 결과 부가 파일. `.partial.log`(일부 실패), `.error.log`(전체 파싱 실패). [`src/pipeline/csvIO.ts`](../src/pipeline/csvIO.ts) |
| **`line_` prefix** | CSV 컬럼명에서 가격 라인임을 표시하는 접두사. `line_s1`, `line_r1` 등. 이 접두사를 가진 컬럼이 LineSpec으로 변환된다. [`src/pipeline/csvIO.ts`](../src/pipeline/csvIO.ts) |

---

## Chart 관련

| 용어 | 정의 |
|------|------|
| **DailyCandle** | 일봉 1개의 데이터. `{ time, krx: OHLC, nxt: OHLC, amountKrx, amountNxt, prevCloseKrx, prevCloseNxt }`. [`src/lib/chartTypes.ts`](../src/lib/chartTypes.ts) |
| **MinuteCandle** | 분봉 1개의 데이터. `{ time, krx: OHLC, nxt: OHLC, volume, amount, accAmount }`. [`src/lib/chartTypes.ts`](../src/lib/chartTypes.ts) |
| **prevCloseKrx** | KRX 전일 종가. 일봉 고가 등락률과 분봉 priceLine % 변환의 기준. [`src/lib/chartTypes.ts`](../src/lib/chartTypes.ts) |
| **prevCloseNxt** | NXT 전일 종가. variant=NXT일 때 high-rate marker 계산 기준. [`src/lib/chartTypes.ts`](../src/lib/chartTypes.ts) |
| **priceLine** | lightweight-charts의 수평 가격 기준선. 일봉에는 원화 가격 그대로, 분봉에는 % 변환값으로 표시. [`src/lib/chart/priceLines.ts`](../src/lib/chart/priceLines.ts) |
| **high-rate marker** | 일중 고가 등락률이 10% 이상인 일봉 캔들 위에 표시되는 원형 마커. [`src/lib/chart/highMarker.ts`](../src/lib/chart/highMarker.ts) |
| **capture-root** | 스크린샷 대상 DOM 요소. `<div id="capture-root">`. [`ChartCaptureClient.tsx`](../src/app/capture/%5BstockCode%5D/%5BtradeDate%5D/%5Bvariant%5D/ChartCaptureClient.tsx) |
| **captureBox** | 캡처 영역의 픽셀 크기 `{ width, height }`. 브라우저 viewport와 동일하게 맞춘다. [`capture.config.ts`](../capture.config.ts) |

---

## Pipeline 관련

| 용어 | 정의 |
|------|------|
| **NextServerHandle** | `startNextServer()`가 반환하는 객체. `{ baseUrl, stop }`. [`src/pipeline/nextServer.ts`](../src/pipeline/nextServer.ts) |
| **PlaywrightDriver** | `createPlaywrightDriver()`가 반환하는 객체. `{ capture(job), close() }`. [`src/pipeline/playwrightDriver.ts`](../src/pipeline/playwrightDriver.ts) |
| **externalServerUrl** | 외부에서 이미 기동된 Next 서버 URL. 설정 시 `startNextServer`를 건너뛴다. [`capture.config.ts`](../capture.config.ts) |
| **devMode** | `true`면 `next dev`, `false`면 `next start`. 프로덕션 캡처에는 `false` 사용. [`capture.config.ts`](../capture.config.ts) |
| **concurrency** | 동시 캡처 job 수. 1이면 단일 Page 재사용, 2 이상이면 job마다 새 Page 생성. [`src/pipeline/playwrightDriver.ts`](../src/pipeline/playwrightDriver.ts) |

---

## 약어

| 약어 | 의미 |
|------|------|
| **KRX** | 한국거래소 (Korea Exchange) — 국내 주식 시장 |
| **NXT** | 넥스트레이드 (Nextrade) — 대체거래소 |
| **KST** | 한국 표준시 (UTC+9) |
| **DPR** | Device Pixel Ratio — `deviceScaleFactor` 설정값, 고해상도 PNG 생성에 사용 |
| **OHLC** | Open / High / Low / Close — 시가, 고가, 저가, 종가 |
| **DTO** | Data Transfer Object — DB 결과를 차트 타입으로 변환하는 매퍼 계층 |
| **ADR** | Architecture Decision Record — 설계 결정 문서 |
