/** 시트 레이어 표준 에러. meta 에 진단 컨텍스트(op/status/range 등)를 싣는다. */
export class SheetsError extends Error {
    constructor(
        message: string,
        readonly meta?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "SheetsError";
    }
}

/**
 * 탭 부재(범위 파싱 실패 400 / 404)로 추정되는 에러인지. appendRows 자가복구 트리거용.
 * SheetsError 면 meta.status 를, 아니면 raw code/status 를 본다.
 */
export function isMissingTabError(err: unknown): boolean {
    const status =
        err instanceof SheetsError
            ? (err.meta?.status as number | undefined)
            : ((err as { code?: number; status?: number })?.code ??
              (err as { status?: number })?.status);
    return status === 400 || status === 404;
}
