/**
 * DART 코어 전반에서 던지는 표준 에러. meta 로 진단 컨텍스트(apiId/status/params/message 등)를 실어 보낸다.
 * ⚠ DART 는 인증키가 쿼리스트링(crtfc_key)에 실린다 — message·meta 에 URL·전체 쿼리를 넣지 않는다.
 */
export class DartError extends Error {
    constructor(
        message: string,
        readonly meta?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "DartError";
    }
}
