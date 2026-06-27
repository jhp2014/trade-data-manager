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

/**
 * KIS 토큰 만료시각 형식: "YYYY-MM-DD HH:MM:SS" (KST 로컬). 예: "2026-06-28 09:23:45".
 * 키움(14자리)과 달라 별도 파서를 둔다.
 */
export function parseKisDate(s: string | null | undefined): Date | null {
    if (!s) return null;
    // 공백을 'T' 로 바꿔 로컬시간으로 파싱(Z 없음 → KST 로컬 그대로).
    const d = new Date(s.trim().replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** marginMs(기본 5분) 여유를 두고 토큰이 아직 유효한지. */
export function isTokenValid(
    expiresAt: string | null | undefined,
    marginMs = 5 * 60 * 1000,
    now = Date.now(),
): boolean {
    const d = parseKisDate(expiresAt);
    if (!d) return false;
    return d.getTime() > now + marginMs;
}
