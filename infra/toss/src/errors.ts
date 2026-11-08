/**
 * 토스 코어 전반에서 던지는 표준 에러. meta.code 가 토스 오류 코드(예: stock-not-found)다.
 * ⚠ message·meta 에 client_secret·토큰을 넣지 않는다.
 */
export class TossError extends Error {
    constructor(
        message: string,
        readonly meta?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "TossError";
    }
}
