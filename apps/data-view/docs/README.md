> 이 파일이 답하려는 질문: 어떤 문서를 언제 봐야 하는가?

# data-view 문서 인덱스

코드 README([`../README.md`](../README.md))는 실행 방법과 디렉터리 구조를 다루고, **이 문서 모음은 *왜* 이렇게 만들었는가와 *어떻게 동작하는가*를 다룬다.** 6개월 뒤의 본인이나 코드를 처음 보는 AI 에이전트가 컨텍스트 없이도 핵심 흐름과 설계 의도를 파악할 수 있도록 구성했다.

---

## 문서 종류와 사용 시점

| 상황 | 볼 문서 |
|------|---------|
| 처음 프로젝트를 본다 | 코드 [README](../README.md) → [glossary.md](./glossary.md) → [architecture/data-flow.md](./architecture/data-flow.md) |
| 특정 기능이 어떻게 동작하는지 알고 싶다 | `architecture/<기능>.md` |
| 왜 이렇게 짰는지 궁금하다 | `decisions/*.md` (ADR) |
| 새 필터를 추가한다 | [adding-filter.md](./adding-filter.md) |
| 새 컬럼을 추가한다 | [adding-entry-column.md](./adding-entry-column.md) |
| 새 차트 지표를 추가한다 | [adding-chart-indicator.md](./adding-chart-indicator.md) |

---

## Architecture 문서 목록

| 문서 | 한 줄 설명 |
|------|-----------|
| [data-flow.md](./architecture/data-flow.md) | URL 진입부터 `EntryRow` 렌더까지 전체 데이터 파이프라인 |
| [filter-system.md](./architecture/filter-system.md) | FilterInstance·KINDS·derivedMap이 동기화되는 구조 |
| [member-predicate.md](./architecture/member-predicate.md) | MemberPredicate·ConditionKind 도메인 모델 |
| [chart-modal.md](./architecture/chart-modal.md) | 행 클릭부터 차트 렌더·언마운트까지 모달 라이프사이클 |
| [chart-tooltip.md](./architecture/chart-tooltip.md) | 마우스 hover 이벤트에서 React 툴팁이 그려지기까지의 정확한 단계 |

---

## ADR 목록

| 번호 | 제목 | 상태 |
|------|------|------|
| [ADR-001](./decisions/001-filter-registry.md) | Filter Registry 패턴 | Superseded by ADR-010 |
| [ADR-002](./decisions/002-chart-tooltip-react.md) | Chart Tooltip을 React 컴포넌트로 | Accepted |
| [ADR-003](./decisions/003-chartpadding-option-b.md) | chartPadding 옵션 B (범위 내 채우기) | Accepted |
| [ADR-004](./decisions/004-clamp-container-width.md) | 컨테이너 너비 `clamp()` 적용 | Accepted |
| [ADR-005](./decisions/005-result-type.md) | `Result<T>` 합성 타입 | Accepted |
| [ADR-006](./decisions/006-bigint-serialization.md) | bigint → string 직렬화 | Accepted |
| [ADR-007](./decisions/007-unit-brand-types.md) | 단위 Brand 타입 (`Eok`/`Mil`/`Krw`) | Accepted |
| [ADR-008](./decisions/008-option-filter-separation.md) | Option Filter를 정적 레지스트리에서 분리 | Superseded by ADR-010 |
| [ADR-009](./decisions/009-daily-chart-krx-nxt-toggle.md) | 일봉 차트 KRX/NXT 토글 | Accepted |
| [ADR-010](./decisions/010-unified-filter-instance-model.md) | 통합 필터 인스턴스 모델 | Accepted |
| [ADR-011](./decisions/011-condition-kind-two-tier.md) | ConditionKind 2단 레지스트리 | Accepted |
| [ADR-012](./decisions/012-chart-overlay-predicate-toggle.md) | 차트 오버레이 Active Predicate 토글 | Accepted |

---

## 문서 작성 규칙

### Architecture 문서 — 5섹션 고정

1. **목적** — 이 문서가 답하려는 질문과 범위
2. **흐름** — 자연어 시퀀스 또는 단계별 설명
3. **핵심 파일** — 표 형식 (파일 / 역할 / 주요 export)
4. **설계 결정** — 각 결정에 대한 한 줄 + ADR 링크
5. **확장 포인트** — 새 기능을 추가할 때 손대야 할 위치

### ADR (Architecture Decision Record) — 6섹션 고정

1. **상태** — `Accepted (YYYY-MM-DD)` 또는 `Superseded by ADR-NNN`
2. **맥락** — 결정이 필요했던 배경 (2~5문장)
3. **검토한 대안** — 각 대안 + 기각/채택 이유
4. **결정** — 채택한 방안 한 단락
5. **결과** — 장점과 단점/한계
6. **관련** — 코드 경로, 기능 문서, 후속 ADR

### 운영 원칙

- 새 설계 결정이 생기면 **ADR을 먼저 쓰고**, 영향받는 architecture 문서를 갱신한다.
- 문서 간 참조는 **상대 경로 마크다운 링크**로 작성한다.
- 코드 헤더 주석의 정책 설명은 ADR/architecture 문서로 옮기고, 코드에는 `See: docs/...` 링크만 남긴다.
