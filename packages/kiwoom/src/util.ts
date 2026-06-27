export type MaybePromise<T> = T | Promise<T>;

/** ms>0 일 때만 실제로 대기. */
export function sleep(ms: number): Promise<void> {
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/** 지수 백오프 + 지터. attempt 는 1부터. 상한 maxMs. */
export function backoffDelay(attempt: number, baseMs = 200, maxMs = 5000): number {
    const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
    return Math.floor(exp / 2 + Math.random() * (exp / 2));
}

/** 키움 expires_dt: 14자리 YYYYMMDDHHMMSS (로컬시간). */
export function parseKiwoomDate(dt: string): Date {
    return new Date(
        +dt.slice(0, 4),
        +dt.slice(4, 6) - 1,
        +dt.slice(6, 8),
        +dt.slice(8, 10),
        +dt.slice(10, 12),
        +dt.slice(12, 14),
    );
}

/** marginMs(기본 5분) 여유를 두고 토큰이 아직 유효한지. */
export function isTokenValid(
    expiresDt: string | null | undefined,
    marginMs = 5 * 60 * 1000,
    now = Date.now(),
): boolean {
    if (!expiresDt || expiresDt.length !== 14) return false;
    return parseKiwoomDate(expiresDt).getTime() > now + marginMs;
}
