/** KIS 코어 전반에서 던지는 표준 에러. meta 로 진단 컨텍스트(trId/status/msgCd/credential 등)를 실어 보낸다. */
export class KisError extends Error {
    constructor(
        message: string,
        readonly meta?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "KisError";
    }
}
