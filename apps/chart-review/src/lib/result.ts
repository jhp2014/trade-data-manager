/**
 * Server Action 성공/실패 합성 타입.
 * See: docs/decisions/005-result-type.md
 */
export type OkResult<T extends Record<string, unknown>> = { ok: true } & T;
export type ErrResult = { ok: false; error: string };

/** T 는 성공 시 페이로드 형태. */
export type Result<T extends Record<string, unknown>> = OkResult<T> | ErrResult;

export function okResult<T extends Record<string, unknown>>(payload: T): OkResult<T> {
    return { ok: true, ...payload };
}

export function errResult(error: unknown): ErrResult {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
}
