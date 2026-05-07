/**
 * Server Action 공통 Result 타입.
 * ok: true  → 성공 페이로드가 인라인으로 포함됨 ({ ok: true } & T)
 * ok: false → error 메시지 문자열
 */
export type OkResult<T extends Record<string, unknown>> = { ok: true } & T;
export type ErrResult = { ok: false; error: string };

/** 성공 또는 실패를 나타내는 합성 타입. T 는 성공 시 페이로드 형태. */
export type Result<T extends Record<string, unknown>> = OkResult<T> | ErrResult;

export function okResult<T extends Record<string, unknown>>(payload: T): OkResult<T> {
    return { ok: true, ...payload };
}

export function errResult(error: unknown): ErrResult {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
}
