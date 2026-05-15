# ADR-007: 항상 KRX/NXT 두 variant 모두 캡처

## 상태

Accepted (2026-05-15)

---

## 맥락

ADR-003에서는 `is_nxt_available=false`인 종목의 NXT 캡처를 skip했다. 그러나 운영 중 다음 두 가지 문제가 드러났다.

1. **키움 `nxtEnable` 응답의 신뢰도 부족**: 실제 NXT 거래 데이터가 들어오는 종목인데도 키움이 `nxtEnable="N"`로 내려주는 사례가 산발적으로 발견됨. 이로 인해 필요한 NXT 캡처가 누락되는 경우 발생.

2. **NXT 미지원 종목의 응답 특성**: 키움 일봉 API에 `005930_AL` 같은 NXT 코드로 조회하면, 실제로 NXT 거래가 없는 종목도 **KRX와 동일한 데이터**를 응답으로 내려준다. 즉 NXT 데이터가 없다고 해서 차트가 비거나 깨지지 않고, KRX와 동일한 차트가 그려진다.

이 두 가지를 종합하면, **NXT skip의 이득(중복 파일 회피)보다 누락 위험이 더 크다**.

---

## 검토한 대안

**A. `is_nxt_available` 보정 로직 도입 (자동 자가 보정)**
- batch 수집 시 NXT 일봉에 실제 거래 데이터가 있는지 검사해서 컬럼을 보정.
- 기각 이유: 보정 로직 자체의 정확도를 검증하기 어렵고, 컬럼을 신뢰 가능한 상태로 만드는 노력 대비 이득이 작음. 어차피 chart-capture에서만 쓰는 컬럼.

**B. `is_nxt_available` 컬럼 폐기**
- 컬럼 자체를 제거하고 chart-capture는 무조건 둘 다 캡처.
- 기각 이유: DB 마이그레이션 비용. 컬럼이 있어도 아무 코드가 의존하지 않으면 사실상 비활성 컬럼이라 그대로 둬도 무방.

**C. 항상 둘 다 캡처 (채택)**
- chart-capture에서 `is_nxt_available` 의존 제거. KRX/NXT variant 둘 다 무조건 캡처.
- NXT 데이터가 없는 종목은 KRX와 동일한 차트가 생성되는데, 분류 작업 시 시각적으로 즉시 구분 가능하므로 실용상 문제 없음.

---

## 결정

`chart-capture`의 page.tsx와 runCapture.ts에서 `is_nxt_available` 의존 분기를 제거하고, `config.variants` 배열에 들어있는 모든 variant에 대해 캡처를 시도한다.

`is_nxt_available` 컬럼은 DB와 batch에 그대로 유지하되, **신뢰할 수 없는 참고용 값**으로 취급한다. batch는 키움 응답의 변종(대소문자, 공백)에 대한 방어 코드만 추가한다.

---

## 결과

**장점**
- 키움 `nxtEnable` 오류로 인한 NXT 캡처 누락 사라짐.
- 캡처 로직 단순화 (skip 분기 제거).
- DB 마이그레이션 불필요.

**단점 / 한계**
- NXT 미지원 종목에 대해 KRX와 동일한 차트가 NXT 파일명으로 한 장 더 생성됨 (디스크 공간 약간 증가, 분류 작업 시 중복 파일 확인 필요).
- `is_nxt_available` 컬럼이 사실상 dead column이 됨. 향후 다른 용도로 활용하거나 제거할지는 별도 검토.

---

## 관련

- 폐기된 ADR-003
- 변경 위치: [`src/app/capture/.../page.tsx`](../../src/app/capture/%5BstockCode%5D/%5BtradeDate%5D/%5Bvariant%5D/page.tsx), [`src/pipeline/runCapture.ts`](../../src/pipeline/runCapture.ts)
