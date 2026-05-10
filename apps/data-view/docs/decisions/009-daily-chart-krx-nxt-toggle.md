# ADR-009: 일봉 차트 KRX/NXT 토글

## 상태

Superseded by ADR-014 (2026-05-10)  
원본 결정: Accepted (2026-05-08)

## 맥락

`dailyCandles` 테이블은 KRX와 NXT 통합 OHLCV를 모두 저장하지만, `toDailyChartCandle` 매퍼는 KRX 필드만 클라이언트로 전달했다. 상한가·하한가 이후의 실질 등락을 보려면 NXT 캔들이 필요하다는 요구가 생겼고, 분봉/오버레이는 이미 `closeRateNxt` 기반의 등락률 시리즈라 일봉만 KRX 기준이면 일관성도 떨어진다.

## 검토한 대안

- **A: 현재 유지** — KRX만 표시. 기각: 사용자가 NXT 캔들을 볼 수 없음.
- **B: NXT를 기본으로 변경** — 기각: KRX가 공식 종가 기준이라 대부분의 사용자에게 익숙하고, 거래량 절댓값도 KRX가 더 큼.
- **C: 두 시리즈를 동시에 표시 (오버레이)** — 기각: 캔들 두 개가 겹치면 OHLC 가독성이 무너짐. 가격축 단위가 같아도 시각적으로 혼란.
- **D: 컴포넌트 내부 토글 (채택)** — 기본 KRX, 사용자가 NXT로 전환 가능. 영속화로 선호도 유지.

## 결정

**D안** 채택. `ChartCandle`에 NXT OHLCV 필드를 optional로 추가하고, `toDailyChartCandle`에서 함께 매핑한다. `RealDailyChart`는 `useUiStore.dailyChartPriceMode`를 구독해 캔들 시리즈와 거래량 히스토그램을 모드에 따라 다른 필드로 바인딩한다. 토글 UI는 차트 우상단 오버레이로 배치한다.

고가 마커는 모드와 무관하게 항상 KRX `prevCloseKrx`/`high` 기준으로 계산한다. "공식 종가 대비 의미 있는 고점"이라는 마커의 의미를 유지하기 위함이며, NXT는 변동성이 더 커서 마커가 과도하게 찍힐 수 있다.

분봉/오버레이는 이미 `closeRateNxt` 기반의 등락률 % 시리즈라 토글이 적용되지 않는다.

## 결과

- **장점**: 사용자가 상황에 맞게 기준을 선택. 영속화로 매번 모드 변경할 필요 없음. 두 데이터 모두 매퍼에서 한 번에 처리되므로 추가 서버 요청 없음.
- **단점/한계**: NXT 모드에서 마커가 KRX 기준이라 시각적으로 마커 위치(KRX high)와 캔들 high(NXT high)가 살짝 다를 수 있음. 의도된 동작이며 마커 위치는 시간축에서 같은 봉이라 큰 혼란은 없을 것으로 예상.

## 관련

- 코드: `src/components/chart/RealDailyChart.tsx`, `src/lib/chart/mappers.ts`, `src/stores/useUiStore.ts`
- 기능 문서: [`docs/architecture/chart-modal.md`](../architecture/chart-modal.md)
- 후속 ADR: 없음
