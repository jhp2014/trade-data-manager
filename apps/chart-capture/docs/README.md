> 이 파일이 답하려는 질문: 어떤 문서를 언제 봐야 하는가?

# chart-capture 문서 인덱스

코드 README([`../README.md`](../README.md))는 실행 방법과 디렉터리 구조를 다루고, **이 문서 모음은 *왜* 이렇게 만들었는가와 *어떻게 동작하는가*를 다룬다.** 6개월 뒤의 본인이나 코드를 처음 보는 AI 에이전트가 컨텍스트 없이도 핵심 흐름과 설계 의도를 파악할 수 있도록 구성했다.

---

## 문서 종류와 사용 시점

| 상황 | 볼 문서 |
|------|---------|
| 처음 프로젝트를 본다 | [glossary.md](./glossary.md) → [architecture/pipeline.md](./architecture/pipeline.md) |
| 전체 캡처 파이프라인 흐름이 궁금하다 | [architecture/pipeline.md](./architecture/pipeline.md) |
| Next 페이지와 Playwright가 어떻게 협력하는지 알고 싶다 | [architecture/capture-page.md](./architecture/capture-page.md) |
| 차트 컴포넌트 구조를 이해하고 싶다 | [architecture/chart-rendering.md](./architecture/chart-rendering.md) |
| 왜 이렇게 짰는지 궁금하다 | `decisions/*.md` (ADR) |

---

## Architecture 문서 목록

| 문서 | 한 줄 설명 |
|------|-----------|
| [pipeline.md](./architecture/pipeline.md) | CLI 진입부터 PNG 저장·CSV 이동까지 전체 캡처 파이프라인 |
| [capture-page.md](./architecture/capture-page.md) | Next 서버 컴포넌트·클라이언트 컴포넌트·Playwright의 3자 계약 |
| [chart-rendering.md](./architecture/chart-rendering.md) | DailyChart / MinuteChart 컴포넌트 구조와 ready signal 흐름 |

---

## ADR 목록

| 번호 | 제목 | 상태 |
|------|------|------|
| [ADR-001](./decisions/001-separate-from-data-view.md) | chart-capture를 data-view와 별도 앱으로 분리 | Accepted |
| [ADR-002](./decisions/002-page-evaluate-line-injection.md) | page.evaluate로 라인 데이터 주입 | Accepted |
| [ADR-003](./decisions/003-nxt-skip-not-fallback.md) | NXT 미지원 종목 skip (fallback 없음) | Accepted |
| [ADR-004](./decisions/004-daily-no-line-label.md) | 일봉 차트 priceLine 라벨 제거 | Accepted |
| [ADR-005](./decisions/005-high-rate-marker.md) | variant별 prevClose 기준 high-rate marker | Accepted |

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
