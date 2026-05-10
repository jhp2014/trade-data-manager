> 이 파일이 답하려는 질문: 코드에 등장하는 도메인·기술 용어는 정확히 무엇을 의미하는가?

# 용어집 (Glossary)

코드 전반에 등장하는 용어를 개념 그룹별로 정리합니다. 각 항목은 `**용어** — 정의 (관련 파일)` 형식입니다.

---

## Deck 영역

**deck** — 특정 시점의 종목 진입 후보군을 담은 CSV 파일 모음. `DECKS_DIR` 아래 날짜별 서브디렉터리(`subDir`)에 위치한다.

**DeckEntry** — CSV 한 행에 해당하는 데이터 구조. `stockCode`, `tradeDate`, `tradeTime`, `options`, `priceLines`, `sourceFile` 6개 필드를 가진다. ([`src/deck/types.ts`](../src/deck/types.ts))

**LoadedDecks** — 한 디렉터리에서 모든 CSV를 파싱한 결과물. `entries`(전체 행), `optionKeys`(전체 옵션 컬럼 이름), `priceLineKeys`(전체 가격 라인 컬럼 이름), `files`(파싱한 파일 목록), `duplicateCount`(중복 제거 수)를 포함한다. ([`src/deck/types.ts`](../src/deck/types.ts))

**optionKeys** — CSV 헤더 중 필수 3컬럼(`stockCode`, `tradeDate`, `tradeTime`)과 `line_` prefix 컬럼, 코멘트 컬럼(`_` prefix) 이외의 컬럼 이름 목록. 옵션 필터의 동적 키 목록으로 사용된다.

**priceLines** — `DeckEntry`의 필드. `line_` prefix를 갖는 CSV 컬럼에서 파싱한 가격 배열 맵 (`Record<string, number[]>`). 키는 컬럼명 그대로(`"line_target"`), 값은 `|` 구분 파싱 결과. 일봉·분봉 차트의 `candleSeries.createPriceLine()`으로 수평선으로 표시된다. ([`src/deck/loader.ts`](../src/deck/loader.ts), [ADR-015](./decisions/015-csv-line-prefix-price-line.md), [ADR-016](./decisions/016-remove-indicator-abstraction.md))

**priceLineKeys** — `LoadedDecks`/`LoadedDecksDTO`의 필드. 모든 CSV 파일에서 등장한 `line_` prefix 컬럼 이름의 합집합(정렬됨).

**`line_` prefix** — CSV 컬럼명 접두어. 이 prefix로 시작하는 컬럼은 옵션이 아닌 **가격 라인 컬럼**으로 분류된다. 값은 `"|"` 구분 다중 가격. 옵션 필터·picker에 노출되지 않는다. ([ADR-015](../docs/decisions/015-csv-line-prefix-price-line.md))

**sourceFile** — 해당 `DeckEntry`가 어떤 CSV 파일에서 왔는지 추적하기 위한 파일명 문자열.

**duplicateCount** — 동일한 `(stockCode, tradeDate, tradeTime)` 조합이 여러 파일에 등장했을 때 제거된 수. 디버깅 목적.

**subDir / DECKS_DIR** — `DECKS_DIR`은 환경 변수로 주입되는 CSV 루트 디렉터리. `subDir`은 그 아래의 상대 경로(예: `"2026-04"`). `resolveDeckSubDir(subDir)`로 절대 경로를 생성한다. ([`src/deck/config.ts`](../src/deck/config.ts))

**DeckEntryDTO / LoadedDecksDTO** — 서버 액션에서 클라이언트로 넘길 때의 JSON 직렬화 안전 타입. `DeckEntry`와 동일한 필드를 가지지만 `bigint`가 없다. ([`src/types/deck.ts`](../src/types/deck.ts))

---

## Theme 영역

**theme** — 한국 증시에서 같은 섹터나 이슈로 묶인 종목 그룹. `data-core` DB의 `theme` 테이블에 정의된다.

**themeId** — 테마의 고유 식별자 문자열 (DB primary key).

**themeName** — 사람이 읽을 수 있는 테마 이름 (예: "2차전지", "AI반도체").

**themeSize** — 테마에 속한 종목 총 수(self + peers). `ThemeRowData.themeSize`에서 확인 가능.

**ThemeBundle / ThemeBundleMember** — `data-core`의 `getThemeBundle`이 반환하는 타입. `ThemeBundle`은 테마 단위, `ThemeBundleMember`는 멤버별 일봉/분봉/피처 데이터를 포함한다. 차트 모달에서 사용.

**ThemeSnapshotMember** — `data-core`의 `getThemeSnapshotAt`이 반환하는 특정 시점의 종목 스냅샷. `feature` 필드에 등락률·거래대금 등 집계 지표가 담긴다.

**isSelf** — 현재 조회 대상이 되는 종목(덱에 기록된 종목)을 나타내는 플래그. 테마 멤버 중 한 명만 `isSelf = true`.

**selfRank** — 테마 내에서 자기 종목의 등락률 순위 (1-based, 1이 가장 높음).

**peers** — 같은 테마에 속한 종목 중 자기 종목을 제외한 나머지. `ThemeRowData.peers`에 `StockMetricsDTO[]`로 저장.

---

## Metric 영역

**closeRate** — 분봉 집계 기준 종가 등락률(%). `closeRateNxt`(NXT 기준)와 `closeRateKrx`(KRX 기준)로 분리된다.
- **KRX** 기준: 한국 거래소(Korea Exchange) 공식 종가 대비 등락률
- **NXT** 기준: KRX 전일 종가가 아닌 직전 유효 기준가(next-day reference) 대비 등락률. 상한가·하한가 이후 더 정확한 실질 등락을 반영한다.

**dayHighRate** — 당일 고가 대비 현재 시점의 등락률(%). 고점 대비 현재 위치를 나타낸다.

**pullbackFromHigh** — 당일 고가 이후 얼마나 되돌렸는지 나타내는 값(%). 양수일수록 고점에서 더 많이 하락한 상태.

**minutesSinceDayHigh** — 당일 고가 이후 경과 분 수. 0이면 현재 고가 근처, 클수록 고점이 오래된 상황.

**cumulativeAmount** — 특정 시점까지의 누적 거래대금(원, `bigint → string` 직렬화). `StockMetricsDTO.cumulativeAmount`.

**currentMinuteAmount** — 마지막 분봉의 거래대금(원, `bigint → string` 직렬화). `StockMetricsDTO.currentMinuteAmount`.

**amountDistribution** — `cnt_{a}_amt` 형태의 DB 컬럼을 파싱한 결과. 특정 억원 구간 이상의 분봉 수를 나타내는 히스토그램 데이터. `Record<number, number>` 형태 (구간 → 카운트). ([`src/lib/snapshotMapper.ts`](../src/lib/snapshotMapper.ts))

**cnt_{a}_amt** — DB `minute_features` 테이블의 컬럼 패턴. `a`는 억원 단위 임계값으로, 해당 임계값 이상의 거래대금이 발생한 분봉 수를 의미한다. 예: `cnt_50_amt` = 50억원 이상 분봉 수.

---

## Chart 영역

**DailyCandle** — 일봉 1봉 데이터. `time`(unix seconds UTC), `krx`/`nxt`(중첩 OHLC 구조, 가격 단위), `volumeKrx`, `amountKrx`(MIL 단위), `volumeNxt`, `amountNxt`, `prevCloseKrx`, `prevCloseNxt`를 가진다. ([`src/types/chart.ts`](../src/types/chart.ts), [ADR-013](../docs/decisions/013-chart-candle-type-split.md))

**MinuteCandle** — 분봉 1봉 데이터. `time`, `krx`/`nxt`(중첩 OHLC 구조, % 등락률 단위), `volume`, `amount`(KRW 단위), `accAmount`를 가진다. ([`src/types/chart.ts`](../src/types/chart.ts), [ADR-013](../docs/decisions/013-chart-candle-type-split.md))

**ChartOverlayPoint** — 오버레이 시리즈의 한 시점 데이터. `time`, `valueKrx`(KRX closeRate %), `valueNxt`(NXT closeRate %), `amount`(원), `cumAmount`(원)를 가진다. ([`src/types/chart.ts`](../src/types/chart.ts))

**ChartOverlaySeries** — 테마 오버레이 차트에서 종목 단위 시리즈. `stockCode`, `stockName`, `isSelf`, `series: ChartOverlayPoint[]`를 포함한다. ([`src/types/chart.ts`](../src/types/chart.ts))

**ChartPreviewDTO** — `fetchChartPreviewAction`이 반환하는 차트 전체 데이터 묶음. `daily: DailyCandle[]`, `minute: MinuteCandle[]`, `themeOverlay`, `markerTime`, `themes`, `prevCloseKrx`, `prevCloseNxt` 7개 필드. `prevCloseKrx`/`prevCloseNxt`는 진입일 일봉의 전일 종가이며, 분봉 가격 라인 % 변환 기준값으로 사용된다. ([`src/types/chart.ts`](../src/types/chart.ts))

**chartPriceMode** — `useUiStore`에 persist 저장되는 KRX/NXT 전환 모드 (`"krx" | "nxt"`). 모달 헤더의 토글 버튼으로 변경하며, 일봉·분봉·오버레이 세 차트가 동일한 값을 공유한다. localStorage persist version 2 (기존 `dailyChartPriceMode`에서 마이그레이션). ([ADR-014](../docs/decisions/014-unified-chart-mode-toggle.md))

**markerTime** — 덱에 기록된 진입 시각을 unix seconds로 변환한 값. 분봉·오버레이 차트에서 `▼ 진입` 마커 위치로 사용한다.

**accAmount** — 분봉 캔들의 누적 거래대금(원). 해당 시점까지 당일 누적합. `MinuteCandle.accAmount`.

**prevCloseKrx / prevCloseNxt** — 일봉 캔들의 전일 종가. `prevCloseKrx`는 KRX 기준, `prevCloseNxt`는 NXT 기준. 일봉 차트 hover 툴팁의 등락률 계산 및 분봉 가격 라인 % 변환에 사용된다. `ChartPreviewDTO`에도 포함되어 진입일 기준값으로 전달된다.

**placeholder candle** — `fillMissingMinuteCandles`가 거래 없는 분에 채워 넣는 가짜 봉. OHLC는 직전 봉의 close 값, volume/amount는 0. lightweight-charts가 시간축에서 끊기지 않게 연속 표시하기 위해 필요하다. ([`src/lib/chartPadding.ts`](../src/lib/chartPadding.ts))

---

## Filter 영역

**FilterInstance** — 런타임 필터 하나. `{ id, kind, value }`. `id`는 8자 base36 랜덤 문자열. 동일 kind를 여러 개 동시에 운용할 수 있다. URL에는 `id:kind:payload` 형태로 직렬화된다. ([`src/lib/filter/kinds/types.ts`](../src/lib/filter/kinds/types.ts))

**FilterKind\<TValue\>** — 필터 종류 하나의 동작(직렬화·역직렬화·매칭·UI)을 기술하는 인터페이스. `KINDS` 레지스트리에 등록된다. ([`src/lib/filter/kinds/types.ts`](../src/lib/filter/kinds/types.ts))

**KINDS** — `Record<string, FilterKind<any>>` 레지스트리. `FilterPanel`, `applyFilters`, `useFilterState`가 이 배열을 순회한다. ([`src/lib/filter/kinds/index.ts`](../src/lib/filter/kinds/index.ts))

**BuildCtx** — `FilterKind.deserialize`에 전달되는 컨텍스트. `optionKeys`, `optionRegistry`, `activeInstances`를 포함. `activeInstances`는 `targetActiveRank`의 `refInstanceId` 역참조에 사용된다.

**RowDerived** — 행별 파생 데이터. `activePools: ActivePool[]`. `computeRowDerived`가 필터 적용 전 전체 행에 대해 미리 계산한다. ([`src/lib/filter/derived.ts`](../src/lib/filter/derived.ts))

**ActivePool** — `activeMembersInTheme` 인스턴스 하나에 대응하는 파생 데이터. `instanceId`, `selfRank`(자기 종목의 풀 내 등수, null이면 풀 미포함), `poolSize`(조건 통과 종목 수), `members`(StockMetricsDTO[]).

**FilterChip** — 필터가 활성 상태일 때 칩바에 표시되는 UI 토큰. `{ id, label, instanceId }` 구조.

**OptionValue** — `option` FilterKind의 value 타입. `{ key, mode: 'anyOf'|'contains', values?, needle? }`. 동적 옵션 키를 같은 인스턴스 모델 안에서 다룰 수 있게 한다. ([`src/lib/filter/kinds/option.tsx`](../src/lib/filter/kinds/option.tsx))

**anyOf vs contains** — `anyOf`는 파이프 구분 멀티토큰 값에서 정확한 토큰 포함 여부 검사. `contains`는 옵션 값 전체 문자열에서 대소문자 무시 부분 매칭. distinct 값 수가 20(`ANY_OF_MAX_DISTINCT`) 이하면 `anyOf`가 기본.

---

## MemberPredicate 영역

**ConditionKind\<TValue\>** — 단일 조건의 평가·UI·직렬화를 묶은 정의 객체. `CONDITION_KINDS` 레지스트리에 등록된다. ([`src/lib/condition/types.ts`](../src/lib/condition/types.ts))

**CONDITION_KINDS** — `Record<string, ConditionKind<any>>` 레지스트리. `rate`, `cumAmount`, `amountHits`, `pullback`, `dayHigh`, `minutesSinceHigh` 6종. ([`src/lib/condition/index.ts`](../src/lib/condition/index.ts))

**Condition** — `{ kind: string; value: unknown }`. `CONDITION_KINDS[kind].eval(stockMetrics, value)`로 평가.

**MemberPredicate** — `{ name?: string; conditions: Condition[] }`. `isMember(m, p) = p.conditions.every(c => evalCondition(m, c))`. ([`src/lib/member/predicate.ts`](../src/lib/member/predicate.ts))

**isMember** — `(m: StockMetricsDTO, p: MemberPredicate) => boolean`. 조건이 0개인 predicate는 항상 true.

**ActivePredicateInstance** — 차트 오버레이 토글에 전달되는 구조. `{ id, label, predicate: MemberPredicate }`. `ChartModal`이 `useFilterState()`에서 추출해 `RealThemeOverlayChart`에 prop으로 전달한다.

---

## 단위 (Units)

**KRW** — 원(Korean Won). DB 분봉 거래대금의 단위. 예: `trading_amount` 컬럼.

**MIL** — 백만원(Million KRW). DB 일봉 거래대금(`trading_amount_krx`)의 단위. 1 MIL = 1,000,000원.

**EOK** — 억원. 화면 표시 단위. 1 EOK = 100,000,000원.
- MIL → EOK: `÷ 100` (상수 `AMOUNT_MIL_TO_EOK = 100`)
- KRW → EOK: `÷ 1e8` (상수 `AMOUNT_KRW_TO_EOK = 1e8`)

**Brand 타입** — TypeScript의 `& { readonly [_brand]: "eok" }` 패턴으로 컴파일 타임에 단위 혼용을 방지하는 명목 타입. `Eok`, `Mil`, `Krw` 세 가지. 함수 시그니처에서 단위를 강제한다. ([`src/lib/units.ts`](../src/lib/units.ts), [ADR-007](./decisions/007-unit-brand-types.md))

---

## 기술 용어

**Result\<T\>** — Server Action의 성공/실패를 명시적으로 표현하는 합성 타입. `{ ok: true } & T` 또는 `{ ok: false; error: string }`. ([`src/lib/result.ts`](../src/lib/result.ts), [ADR-005](./decisions/005-result-type.md))

**okResult / errResult** — `Result<T>`를 생성하는 헬퍼 함수.

**Server Action** — Next.js의 서버 측 비동기 함수. `"use server"` 지시문으로 선언되며, 클라이언트에서 직접 호출할 수 있다. 반환값은 JSON으로 직렬화된다.

**nuqs** — URL 쿼리스트링을 React 상태처럼 다루는 라이브러리. `useQueryStates`로 URL ↔ 상태를 동기화한다. `useFilterState`에서 사용.

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
