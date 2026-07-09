/** Drive 레이어 표준 에러. meta 에 진단 컨텍스트(op/status/fileId 등)를 싣는다. */
export class DriveError extends Error {
    constructor(
        message: string,
        readonly meta?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "DriveError";
    }
}
