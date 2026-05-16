> 이 파일이 답하려는 질문: 코드에 등장하는 도메인·기술 용어는 정확히 무엇을 의미하는가?

# 용어집 (Glossary)

코드 전반에 등장하는 용어를 개념 그룹별로 정리합니다. 각 항목은 `**용어** — 정의 (관련 파일)` 형식입니다.

---

## Theme 영역

**theme** — 한국 증시에서 같은 섹터나 이슈로 묶인 종목 그룹. `data-core` DB의 `theme` 테이블에 정의된다.

**themeId** — 테마의 고유 식별자 문자열 (DB primary key).

**themeName** — 사람이 읽을 수 있는 테마 이름 (예: "2차전지", "AI반도체").

**ThemeBundle / ThemeBundleMember** — `data-core`의 `getThemeBundle`이 반환하는 타입. `ThemeBundle`은 테마 단위, `ThemeBundleMember`는 멤버별 일봉/분봉/피처 데이터를 포함한다. 차트 모달에서 사용.

**isSelf** — 현재 조회 대상이 되는 종목을 나타내는 플래그. 테마 멤버 중 한 명만 `isSelf = true`.

**peers** — 같은 테마에 속한 종목 중 자기 종목을 제외한 나머지.

---

## Chart 영역

**DailyCandle** — 일봉 1봉 데이터. `time`(unix seconds UTC), `krx`/`nxt`(중첩 OHLC 구조, 가격 단위), `volumeKrx`, `amountKrx`(MIL 단위), `volumeNxt`, `amountNxt`, `prevCloseKrx`, `prevCloseNxt`를 가진다. ([`src/types/chart.ts`](../src/types/chart.ts), [ADR-013](../docs/decisions/013-chart-candle-type-split.md))

**MinuteCandle** — 분봉 1봉 데이터. `time`, `krx`/`nxt`(중첩 OHLC 구조, % 등락률 단위), `volume`, `amount`(KRW 단위), `accAmount`를 가진다. ([`src/types/chart.ts`](../src/types/chart.ts), [ADR-013](../docs/decisions/013-chart-candle-type-split.md))

**ChartOverlayPoint** — 오버레이 시리즈의 한 시점 데이터. `time`, `valueKrx`(KRX closeRate %), `valueNxt`(NXT closeRate %), `amount`(원), `cumAmount`(원)를 가진다. ([`src/types/chart.ts`](../src/types/chart.ts))

**ChartOverlaySeries** — 테마 오버레이 차트에서 종목 단위 시리즈. `stockCode`, `stockName`, `isSelf`, `series: ChartOverlayPoint[]`를 포함한다. ([`src/types/chart.ts`](../src/types/chart.ts))

**ChartPreviewDTO** — `fetchChartPreviewAction`이 반환하는 차트 전체 데이터 묶음. `daily: DailyCandle[]`, `minute: MinuteCandle[]`, `themeOverlay`, `markerTime`, `themes`, `prevCloseKrx`, `prevCloseNxt` 7개 필드. ([`src/types/chart.ts`](../src/types/chart.ts))

**chartPriceMode** — `useUiStore`에 persist 저장되는 KRX/NXT 전환 모드 (`"krx" | "nxt"`). 모달 헤더의 토글 버튼으로 변경하며, 일봉·분봉·오버레이 세 차트가 동일한 값을 공유한다. ([ADR-014](../docs/decisions/014-unified-chart-mode-toggle.md))

**markerTime** — 진입 시각을 unix seconds로 변환한 값. 분봉·오버레이 차트에서 `▼` 마커 위치로 사용한다.

**priceLines** — `ChartModalTarget`의 필드. `line_` prefix 입력 플래그에서 파싱한 가격 배열 맵 (`Record<string, number[]>`). 일봉·분봉 차트의 수평 기준선으로 표시된다. ([ADR-015](./decisions/015-csv-line-prefix-price-line.md), [ADR-016](./decisions/016-remove-indicator-abstraction.md))

**`-pl` 플래그** — `/stock-chart` 입력창에서 `005930 2026-04-21 -pl 51000|41000` 형식으로 가격선을 직접 지정하는 입력 형식.

**accAmount** — 분봉 캔들의 누적 거래대금(원). 해당 시점까지 당일 누적합. `MinuteCandle.accAmount`.

**prevCloseKrx / prevCloseNxt** — 일봉 캔들의 전일 종가. 일봉 차트 hover 툴팁의 등락률 계산 및 분봉 가격 라인 % 변환에 사용된다.

**placeholder candle** — `fillMissingMinuteCandles`가 거래 없는 분에 채워 넣는 가짜 봉. OHLC는 직전 봉의 close 값, volume/amount는 0. lightweight-charts가 시간축에서 끊기지 않게 연속 표시하기 위해 필요하다. ([`src/lib/chartPadding.ts`](../src/lib/chartPadding.ts))

---

## 단위 (Units)

**KRW** — 원(Korean Won). DB 분봉 거래대금의 단위.

**MIL** — 백만원(Million KRW). DB 일봉 거래대금(`trading_amount_krx`)의 단위. 1 MIL = 1,000,000원.

**EOK** — 억원. 화면 표시 단위. 1 EOK = 100,000,000원.
- MIL → EOK: `÷ 100` (상수 `AMOUNT_MIL_TO_EOK = 100`)
- KRW → EOK: `÷ 1e8` (상수 `AMOUNT_KRW_TO_EOK = 1e8`)

**Brand 타입** — TypeScript의 `& { readonly [_brand]: "eok" }` 패턴으로 컴파일 타임에 단위 혼용을 방지하는 명목 타입. `Eok`, `Mil`, `Krw` 세 가지. ([`src/lib/units.ts`](../src/lib/units.ts), [ADR-007](./decisions/007-unit-brand-types.md))

---

## 기술 용어

**Server Action** — Next.js의 서버 측 비동기 함수. `"use server"` 지시문으로 선언되며, 클라이언트에서 직접 호출할 수 있다. 반환값은 JSON으로 직렬화된다.

**QueryProvider** — `@tanstack/react-query`의 `QueryClientProvider` 래퍼. 차트 미리보기 데이터를 5분 staleTime으로 캐싱한다. ([`src/providers/QueryProvider.tsx`](../src/providers/QueryProvider.tsx))

**lightweight-charts** — TradingView의 오픈소스 캔들스틱 차트 라이브러리. DOM 직접 조작 방식으로 고성능을 유지한다.

**RAF throttle** — `requestAnimationFrame`을 1회 예약해 여러 이벤트를 다음 프레임 한 번에 처리하는 패턴. 분봉/일봉/오버레이 차트 hover 처리에 공통 적용.

**portal** — React `createPortal`로 컴포넌트를 DOM 트리의 다른 위치에 렌더하는 기법. 차트 툴팁이 차트 컨테이너 안에 마운트될 때 사용.

**clamp()** — CSS 함수. `clamp(min, preferred, max)` 형태로 값을 min~max 범위 내에서 선형 변화시킨다. 컨테이너 너비에 적용. ([ADR-004](./decisions/004-clamp-container-width.md))

---

## 약어

| 약어 | 전체 표기 | 설명 |
|------|-----------|------|
| **KRX** | Korea Exchange | 한국 거래소. 공식 주가 기준. |
| **NXT** | Next(-day reference) | 직전 유효 기준가 기반 등락률. 상한가 등 특수 상황에서 KRX보다 실질 수익률에 가깝다. |
| **KST** | Korea Standard Time | UTC+9. 차트 시간축과 날짜 변환에 사용. |
| **OHLC** | Open/High/Low/Close | 봉차트 4가지 가격. |
| **DTO** | Data Transfer Object | 레이어 간 데이터 전달용 단순 구조체. 주로 서버→클라이언트 직렬화 시 사용. |
| **ADR** | Architecture Decision Record | 주요 설계 결정을 기록하는 문서 형식. [`docs/decisions/`](./decisions/) 에 위치. |
