> 이 파일이 답하려는 질문: 빈 tradeTime을 왜 장 마감 시각으로 채우는가?

# ADR-017: 빈 tradeTime을 장 마감 시각으로 통일

## 상태

Accepted (2026-05-22)

---

## 맥락

CSV 입력에서 "분석 대상이지만 매매 진입하지 않은 종목"을 기록할 때 `tradeTime`을 비워두는 사용 패턴이 빈번하다. 진입하지 않은 사유는 `skipReason` 같은 옵션 컬럼에 명시한다. 기존 로더는 `tradeTime`이 비어 있는 행을 silent하게 drop하여 옵션 필터의 distinct 값 수집과 row 노출이 모두 누락됐다.

---

## 검토한 대안

### A. tradeTime을 빈 문자열로 유지

영향받는 모든 코드 경로(EntryRow 표시/차트 진입, deck action의 DB 조회, timeRange 필터, MetricAmount 렌더링 등)에 빈 값 분기 처리 필요. 변경 범위가 넓고 정책 결정 지점이 많아짐.

기각.

### B. 로더 단계에서 `"15:30:00"`으로 채움 (채택)

단일 지점에서만 처리. 사용자 매매 도메인에서 15:30은 진입 타점으로 사용되지 않아 의미 충돌이 없음. 다른 코드 경로는 naive한 상태로 유지 가능.

### C. tradeTime을 nullable로 타입 변경

가장 정확한 표현이지만 타입 변경 파급 효과가 크고, "진입 안 함"의 의미는 이미 `skipReason`이 담당하므로 중복.

기각.

---

## 결정

**선택지 B**를 채택한다. `apps/data-view/src/deck/loader.ts`에서 `tradeTime`이 빈 값일 때 상수 `TRADE_TIME_FALLBACK = "15:30:00"`을 적용한다.

---

## 결과

**장점**
- 변경 범위 최소화 — 로더 단일 지점만 수정.
- 코드 경로 단순화 — 다른 모든 경로가 빈 값 분기 없이 동작.
- DB 스냅샷 조회 일관성 — 15:30 기준 장 마감 스냅샷으로 자연스럽게 평가.
- 옵션 필터 distinct 값 수집 누락 해소.

**한계**
- "원래 시각이 없었던 row"와 "사용자가 명시적으로 15:30을 기록한 row" 구분 불가. 본 프로젝트의 매매 도메인 특성상 15:30 진입 타점은 발생하지 않으므로 수용 가능.

---

## 관련

- 수정 파일: [`src/deck/loader.ts`](../../src/deck/loader.ts)
- 관련 타입: [`src/deck/types.ts`](../../src/deck/types.ts)
- 의도적으로 naive하게 유지하는 코드: `src/actions/deck.ts`, `src/components/list/EntryRow.tsx`, `src/lib/filter/kinds/timeRange.tsx`
