# ADR-018: VI 종목 feature carry-forward

## 상태

Accepted (2026-05-26)

## 맥락

`getThemeSnapshotAt` 은 `(stockCode, tradeDate, tradeTime)` 시점의 테마 멤버 feature 를 LEFT JOIN 으로 모은다. VI(변동성 완화장치) 발동 등으로 해당 분(分) 에 분봉이 없으면 그 멤버의 `feature` 가 `null` 로 떨어진다. 이 상태로 다운스트림에서:

- `peerList.ts` 는 `feature !== null` 멤버만 필터해 PeerListModal 에 노출하므로 VI 발동 종목이 통째로 사라진다.
- `deck.ts` 의 self 도 feature null 이면 row 가 생성되지 않을 수 있다(현재는 항상 객체이지만 의미상 빈 row 다).
- 차트 오버레이(`chartPadding.ts`)는 ADR-003 에 따라 이미 직전 봉의 close 로 carry-forward 하므로 PeerListModal 에서만 종목이 사라지는 비대칭이 발생한다.

이 비일관성과 누락을 해소할 정책을 고른다.

## 검토한 대안

- **A: 그대로 null 두고 UI 에서 표시** — 액션/DTO 는 변경 없음. PeerListModal 만 "거래없음" 행을 따로 그린다. 기각: 차트는 이미 carry-forward 라서 두 경로의 정책이 어긋난 채로 굳어진다.
- **B: DB 에 carry 행을 미리 저장** — feature 빌드 시 빈 분에도 행을 채워둔다. 기각: 저장 비용/스키마 정합성(`minute_candle_id` FK)/정책 변경 시 재계산 비용 모두 비싸다.
- **C: data-core 런타임 carry-forward (채택)** — `getThemeSnapshotAt` 안에서 null 멤버에 대해 같은 tradeDate 내 직전 시점 feature 를 한 번의 fallback 쿼리(`DISTINCT ON`) 로 모아 carry 매핑한다. 모든 다운스트림(peerList, deck self, 향후 추가 소비자)이 자동으로 혜택.
- **D: data-view 액션 레이어에서 carry-forward** — `peerList`/`deck` 액션이 각자 빈 멤버를 채운다. 기각: 같은 정책이 두 곳에 흩어지고 data-core 의 응집도가 떨어진다.

## 결정

**C 안 채택**. `packages/data-core/src/queries/theme-snapshot.ts` 의 `getThemeSnapshotAt` 이 다음과 같이 동작한다.

1. 기존 `findFeaturesAt` 로 요청 시점 feature 를 모은다.
2. feature 가 비어 있는 stockCode 만 모아 `findLatestFeaturesBeforeTime` 로 같은 tradeDate 의 `tradeTime < 요청시간` 중 가장 최근 1건씩을 단일 `DISTINCT ON` 쿼리로 가져온다.
3. 가져온 prev 를 base 로 carry feature 객체를 새로 만들어(원본 mutate 금지) null 슬롯을 채운다. fallback 에서도 prev 가 없는 종목(그날 첫 거래 전)은 `feature: null` 그대로 둔다.

carry feature 의 필드 매핑은 다음과 같다.

| 필드 | 처리 |
|------|------|
| `closeRateKrx`, `closeRateNxt` | prev 그대로 |
| `cumulativeTradingAmount` | prev 그대로 |
| `dayHighRate`, `dayHighTime` | prev 그대로 |
| `pullbackFromDayHigh` | prev 그대로 |
| `minutesSinceDayHigh` | prev 그대로 (재계산 안 함) |
| `cnt_*_amt` 분포 카운트 | prev 그대로 |
| `tradingAmount` | "0" (분봉 단위 거래대금) |
| `changeRate{N}m` 시리즈 | "0.00" (변화량 없음) |
| `tradeDate`, `tradeTime` | 요청 시점 값으로 |
| `isCarriedForward` | `true` (신규 메타 필드) |

`ThemeSnapshotMember.feature` 의 타입은 `ThemeSnapshotFeature = MinuteCandleFeatures & { isCarriedForward?: boolean }` 로 확장한다. data-view 의 `StockMetricsDTO` 에도 동일 플래그를 전달한다.

`peerList.ts` 의 `feature !== null` 필터는 제거하고, `peerList`/`deck` 양쪽 정렬을 공통 헬퍼 `sortByCloseRateDesc` 로 통일한다. carry 가 실패한(closeRate=null) 멤버는 자연스럽게 맨 뒤로 밀린다.

이번 작업의 범위는 데이터 레이어와 DTO 까지다. carry 행을 시각적으로 구분하는 UI 배지/스타일은 후속 작업이며, `isCarriedForward` 플래그만 미리 흘려둔다.

## 결과

- **장점**
  - PeerListModal, EntryRow self, ChartModal 이 같은 carry-forward 정책을 공유한다.
  - VI 발동 종목이 더 이상 슬라이더 이동에서 사라지지 않는다.
  - DTO 에 `isCarriedForward` 가 노출되어 후속 UI 변경(배지/툴팁) 비용이 낮다.
- **단점/한계**
  - `minutesSinceDayHigh` 를 재계산하지 않고 prev 그대로 둔다. 엄밀하게는 carry 시점까지 시간이 더 흘렀어야 하지만, 단일 컬럼만 갱신할 가치보다 단순함이 더 크다고 판단했다. carry 행은 보통 1~3분 정도라 표시상 차이가 작다.
  - fallback 쿼리가 1회 추가된다. carry 대상이 0건이면 쿼리 자체를 건너뛰므로 일반 경로 비용은 변하지 않는다.
  - 그날 첫 거래 전(prev 없음) 멤버는 여전히 closeRate=null 로 맨 뒤에 배치된다. 누락은 아니다.

## 관련

- 코드: `packages/data-core/src/queries/theme-snapshot.ts`, `packages/data-core/src/repositories/market-feature.repository.ts` (`findLatestFeaturesBeforeTime`)
- 코드: `apps/data-view/src/lib/snapshotMapper.ts`, `apps/data-view/src/actions/peerList.ts`, `apps/data-view/src/actions/deck.ts`, `apps/data-view/src/lib/sort/sortByCloseRateDesc.ts`
- 기능 문서: [`architecture/data-flow.md`](../architecture/data-flow.md), [`glossary.md`](../glossary.md)
- 선행 ADR: [ADR-003](./003-chartpadding-option-b.md) (차트 padding 의 carry-forward 정책)
- 후속 ADR: 없음
