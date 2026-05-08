# ADR-006: bigint → string 직렬화

## 상태

Accepted (2026-05-08)

## 맥락

`data-core`의 DB 스키마에서 누적 거래대금(`cumulative_trading_amount`, `currentMinuteAmount`)이 `bigint` 타입으로 저장된다. Next.js Server Action의 반환값은 JSON으로 직렬화되는데, JSON은 `bigint`를 지원하지 않아 직렬화 시도 시 런타임 에러가 발생한다. 클라이언트에서 이 값을 어떤 타입으로 받을지 결정이 필요했다.

## 검토한 대안

- **A: `Number(bigint)` 변환** — JavaScript `number`로 캐스팅. 기각: 53비트를 초과하는 정수에서 정밀도가 손실된다. 거래대금이 수조 원에 달할 경우 실제 값과 달라질 수 있다.
- **B: `string` 변환 (채택)** — `bigIntToString(v)` 유틸로 통일. 클라이언트에서 표시 전용으로만 사용하므로 `string`이 충분하다.
- **C: custom transport / superjson** — `bigint`를 직렬화할 수 있는 별도 직렬화 레이어 도입. 기각: Next.js Server Action 페이로드 직렬화 메커니즘을 우회하는 추가 인프라 비용이 크다.

## 결정

**B안** 채택. `src/lib/serialization.ts`의 `bigIntToString` 유틸을 사용해 서버 측에서 미리 `string`으로 변환한다. 클라이언트 타입(`StockMetricsDTO.cumulativeAmount: string | null`)이 이를 반영한다.

## 결과

- **장점**: 정밀도 보존. JSON 직렬화 에러 없음. 클라이언트 코드가 타입 시스템으로 bigint를 받을 것이라 기대하지 않아 혼동이 없다.
- **단점/한계**: 클라이언트에서 수치 연산(정렬, 합산)이 필요하면 `Number()`로 재변환해야 한다. 현재 거래대금은 화면 표시 전용(`fmtKrw`)으로만 사용되어 무해하다.

## 관련

- 코드: `src/lib/serialization.ts`, `src/lib/snapshotMapper.ts`, `src/types/deck.ts`
- 기능 문서: [`docs/architecture/data-flow.md`](../architecture/data-flow.md)
- 후속 ADR: 없음
