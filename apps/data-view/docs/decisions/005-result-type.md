# ADR-005: `Result<T>` 합성 타입

## 상태

Accepted (2026-05-08)

## 맥락

Next.js Server Action에서 `throw`가 발생하면 기본 동작은 에러 바운더리 또는 Next.js 전용 에러 페이지를 노출한다. `loadDeckAction`이나 `fetchChartPreviewAction`에서 DB 연결 실패·파일 없음 등의 예측 가능한 오류가 발생했을 때, 클라이언트 컴포넌트가 적절한 UI(예: "데이터 없음", 토스트)를 보여주려면 성공/실패를 명시적으로 구분하는 반환 타입이 필요했다.

## 검토한 대안

- **A: throw 유지** — 에러를 그냥 던지고 `try/catch`나 에러 바운더리로 처리. 기각: 클라이언트에서 세분화된 에러 처리가 어렵고, 에러 메시지를 클라이언트로 안전하게 전달하는 별도 장치가 필요하다.
- **B: `{ ok: true } & T` | `{ ok: false; error: string }` (채택)** — 성공 페이로드와 실패 메시지를 유니온으로 명시. 작은 헬퍼 함수 `okResult`/`errResult`로 생성.
- **C: `neverthrow` 등 라이브러리** — 검증된 Result 타입 라이브러리 도입. 기각: 의존성 추가 비용 대비 이 프로젝트에서 필요한 기능은 두 헬퍼 함수로 충분히 구현된다.

## 결정

**B안** 채택. `type Result<T> = OkResult<T> | ErrResult`를 `src/lib/result.ts`에 정의하고, 모든 Server Action이 이 타입으로 반환한다. 클라이언트에서는 `if (!res.ok) { /* 에러 처리 */ }` 단일 분기로 처리한다.

## 결과

- **장점**: TypeScript가 `ok: true` 가드를 통과한 이후에만 페이로드 필드에 접근 가능하도록 강제. 에러 메시지가 문자열로 안전하게 직렬화되어 전달됨.
- **단점/한계**: 모든 호출부에서 `ok` 가드를 직접 작성해야 한다. 잊으면 타입 에러가 발생하므로 컴파일 타임에 잡힌다(이는 의도된 설계).

## 관련

- 코드: `src/lib/result.ts`
- 기능 문서: [`docs/architecture/data-flow.md`](../architecture/data-flow.md)
- 후속 ADR: 없음
