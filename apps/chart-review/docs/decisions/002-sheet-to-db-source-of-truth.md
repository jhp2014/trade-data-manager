# ADR-002: DB를 진실 원천으로, Sheet는 작업셋·입출력 매체로

## 상태

Accepted — Sheet→DB 전환(SPEC-phase3/4) 시점.

---

## 맥락

초기 골격은 Google Sheet를 직접 데이터 소스로 읽었다(시트 행 = 타점). 하지만 복기 기능이 커지면서 문제가 드러났다.

- 타점 입력/수정/삭제를 시트에 직접 쓰면 동시성·정합성·구조화(멀티값, 키 레지스트리)가 취약하다.
- 한편 시트는 사람이 필터·정렬·일괄 편집하기에 여전히 가장 편한 매체였다.
- "무엇을 복기할지"(작업셋)와 "복기 데이터 자체"는 다른 관심사인데 시트가 둘을 겸하고 있었다.

---

## 검토한 대안

**A. 계속 Sheet를 1차 저장소로**
- 기각: 구조화된 입력(멀티값 칩, 수동 키 레지스트리, payload jsonb)과 안전한 upsert/삭제를 시트로 감당하기 어렵다.

**B. DB를 진실 원천으로, Sheet는 보조 매체 — 채택**
- 복기 데이터는 PostgreSQL(`review_target`/`review_point`/`review_manual_key`)에 저장.
- Sheet는 두 가지로만: (1) 작업셋 정의(어떤 그룹을 볼지), (2) 사람이 보기 좋은 내보내기/가져오기.

---

## 결정

- **읽기**: 시트에서는 `(stockCode, tradeDate)` 키만 dedupe 해 "어떤 그룹을 볼지"만 정한다. `tradeTime`/`m_`/feature 컬럼은 읽기 단계에서 **무시**한다. 실제 값은 DB에서 조회.
- **쓰기(Export)**: DB → Sheet. 타점 1건 = 1행. 작업셋(working) 또는 DB 전체(all) 범위 + 필터.
- **되읽기(Import-merge)**: Sheet의 비어있지 않은 `m_` 값만 DB payload에 병합. **빈 셀은 건드리지 않는다**(시트의 부분 편집이 DB를 삭제하지 못하도록).

---

## 결과

**장점**
- 단일 진실 원천 → 정합성·동시성·구조화 입력이 깔끔해졌다.
- 시트는 사람이 편한 일을(필터·정렬·일괄 편집·공유) 계속 맡는다.
- 작업셋과 데이터의 관심사가 분리됐다 → [ADR-003](./003-read-sheet-as-bookmark.md)의 토대.

**한계**
- Export/Import라는 명시적 동기화 단계가 생긴다(시트가 자동 반영되지는 않음).
- Import-merge는 의도적으로 비파괴(빈 셀 무시)이므로 시트에서 값을 "지워서" DB를 비울 수는 없다(삭제는 앱/`m_` 키 삭제로).

---

## 관련

- 로딩 경로: [`architecture.md`](../architecture.md) §2
- 구현: `src/lib/loadReviewRows.ts`, `src/lib/workingSet.ts`, `src/app/api/review/{export,import-merge}/route.ts`
