# ADR-003: chartPadding 옵션 B (범위 내 채우기)

## 상태

Accepted (2026-05-08)

## 맥락

분봉 raw 데이터에는 거래가 없는 분(分)이 누락되어 있다. lightweight-charts는 시간축을 등간격으로 표시하기 때문에 누락된 분이 있으면 인접 봉이 시각적으로 붙어 보이거나, 시간 레이블이 잘못 표시될 수 있다. 빈 슬롯을 어떤 방식으로 채울지 결정이 필요했다.

## 검토한 대안

- **A: 아무것도 채우지 않음** — 라이브러리가 알아서 처리. 기각: lightweight-charts가 missing bar를 보간하지 않아 차트 폭이 줄어들고, 시간축 레이블 위치가 부정확해진다.
- **B: 첫 봉~마지막 봉 사이만 채우기 (채택)** — 거래 범위 내 빈 분만 직전 봉의 close 값으로 채움(volume/amount는 0). 첫 봉 이전/마지막 봉 이후는 채우지 않음.
- **C: 장전 09:00~장후 15:30 전체 채우기** — 항상 고정된 시간 범위를 채움. 기각: 장 시작 전·후 구간이 모두 placeholder로 채워져 시각적으로 불필요한 공간이 생긴다.

## 결정

**B안** 채택. `fillMissingMinuteCandles`와 `fillMissingOverlayPoints` 두 함수가 이 정책을 구현한다. placeholder 봉의 OHLC는 직전 유효봉의 close를 그대로 사용하므로 수평선으로 표시되어 "거래 없음"을 시각적으로 전달한다. `accAmount`(누적 거래대금)는 직전 값을 유지해 hover 툴팁에서 누적 표시가 유지된다.

## 결과

- **장점**: 거래 있는 구간만 표시되어 불필요한 패딩 없음. placeholder 봉이 수평선으로 그려져 "거래 없는 분"임을 직관적으로 알 수 있다. 오버레이 시리즈도 같은 정책을 공유(`fillMissingOverlayPoints`).
- **단점/한계**: 거래 시간 중간에 긴 공백(예: 서킷브레이커 발동)이 있을 경우 많은 수의 placeholder 봉이 생성된다. 현재 이 케이스에 대한 최대 제한이 없다.

## 관련

- 코드: `src/lib/chartPadding.ts`
- 기능 문서: [`docs/architecture/chart-modal.md`](../architecture/chart-modal.md)
- 후속 ADR: 없음
