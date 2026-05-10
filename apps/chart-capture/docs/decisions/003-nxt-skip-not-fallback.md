# ADR-003: NXT 미지원 종목 — skip (fallback 없음)

## 상태

Accepted

---

## 맥락

CSV에서 `variant=NXT`로 요청이 들어왔을 때, 해당 종목이 넥스트레이드에 미상장(`isNxtAvailable === false`)이면 처리 방법을 결정해야 했다. 두 가지 자연스러운 선택지가 있었다.

---

## 검토한 대안

**A. KRX 데이터로 fallback**
- NXT 미지원 시 KRX 데이터로 렌더링하고 동일한 PNG를 생성.
- 기각 이유: KRX/NXT 파일명이 다른데 내용이 동일해지면 사용자가 혼동한다. 실제로 NXT 데이터가 없는 상황임을 숨기게 된다.

**B. skip하고 partial 로그에 기록 (채택)**
- 페이지에서 `data-empty="true" data-reason="nxt-not-supported"`를 반환하고, Playwright가 이를 감지해 해당 job을 `skipped`로 처리.
- 장점: 사용자에게 명시적으로 "이 종목은 NXT를 지원하지 않는다"는 신호를 준다. `.partial.log`에 기록되어 나중에 확인 가능.

---

## 결정

NXT 미지원 종목의 `variant=NXT` 요청은 skip한다. `page.tsx`에서 DB 조회 후 `isNxtAvailable === false`이면 즉시 empty 마커를 반환하고, Playwright가 감지하면 `skipped` status로 기록한다. PNG 파일은 생성하지 않는다.

---

## 결과

**장점**
- KRX와 NXT 파일이 항상 다른 내용을 가진다.
- skip 이유가 `.partial.log`에 명시된다.

**단점 / 한계**
- NXT 미지원 종목을 CSV에 넣으면 항상 skip된다. 의도적으로 KRX만 원하는 경우 CSV에서 NXT variant를 제외해야 한다.

---

## 관련

- 캡처 페이지 흐름: [`docs/architecture/capture-page.md`](../architecture/capture-page.md)
- 구현 위치: [`src/app/capture/.../page.tsx`](../../src/app/capture/%5BstockCode%5D/%5BtradeDate%5D/%5Bvariant%5D/page.tsx), [`src/pipeline/playwrightDriver.ts`](../../src/pipeline/playwrightDriver.ts)
