# ADR-007: 단위 Brand 타입 (`Eok`/`Mil`/`Krw`)

## 상태

Accepted (2026-05-08)

## 맥락

거래대금 데이터가 DB 테이블마다 다른 단위로 저장된다. 일봉(`trading_amount_krx`)은 백만원(MIL), 분봉(`trading_amount`)은 원(KRW), 화면 표시는 억원(EOK). 세 단위가 모두 `number` 타입이어서 잘못된 단위의 값을 함수에 전달해도 컴파일 타임에 잡히지 않았다. 실제로 MIL 값을 그대로 EOK로 오해해 표시한 버그가 발생할 수 있는 구조였다.

## 검토한 대안

- **A: 주석·명명 규칙만 활용** — `amountMil`, `amountKrw` 등 이름으로 구분. 기각: 타입 시스템이 보장하지 않아 실수가 가능하다.
- **B: Brand 타입 + 변환 함수 (채택)** — `type Eok = number & { readonly [_brand]: "eok" }` 패턴으로 컴파일 타임 단위 강제. `milToEok`, `krwToEok` 변환 함수를 한 번 호출하면 그 이후로는 타입이 맞다.
- **C: 전 도메인 단위 클래스** — `class Amount { constructor(value, unit) }` 형태의 값 객체. 기각: JSON 직렬화 호환성 문제와 오버엔지니어링 위험. `number`의 편의성을 잃는다.

## 결정

**B안** 채택. `Eok`, `Mil`, `Krw` 세 Brand 타입을 `src/lib/units.ts`에 정의하고, 변환 함수(`milToEok`, `krwToEok`)와 포맷 함수(`fmtEok`, `fmtMil`, `fmtKrw`)를 함께 제공한다. 단위 변환 상수(`AMOUNT_MIL_TO_EOK`, `AMOUNT_KRW_TO_EOK`)는 `lib/constants.ts`에 정의해 두 파일 모두에서 참조한다.

## 결과

- **장점**: 함수 시그니처에서 단위가 명확히 드러난다(`fmtEok(v: Eok)`). 잘못된 단위 전달 시 TypeScript 컴파일 에러로 즉시 발견된다.
- **단점/한계**: 외부 데이터(DB row, API 응답)가 `number`로 들어올 때 `as Eok` 캐스팅이 필요하다. 이 경계에서는 단위 정확성을 사람이 검증해야 한다.

## 관련

- 코드: `src/lib/units.ts`, `src/lib/constants.ts`
- 후속 ADR: 없음
