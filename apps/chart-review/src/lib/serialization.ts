/**
 * Server Action ↔ 클라이언트 경계 직렬화 헬퍼 (bigint, Date 변환).
 * See: docs/decisions/006-bigint-serialization.md
 */

// ── 숫자 변환 ──────────────────────────────────────────────────────────────

/** unknown → number. null / undefined / 비정상 값은 0 반환. */
export function toNum(v: unknown): number {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "bigint") return Number(v);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** unknown → number | null. null / undefined / 비정상 값은 null 반환. */
export function toNumOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

/** unknown → 정수 | null. */
export function toInt(v: unknown): number | null {
    const n = toNumOrNull(v);
    return n === null ? null : Math.trunc(n);
}

/** unknown → bigint | null. */
export function toBigInt(v: unknown): bigint | null {
    if (v === null || v === undefined || v === "") return null;
    try {
        if (typeof v === "bigint") return v;
        if (typeof v === "number") return BigInt(Math.trunc(v));
        const s = String(v).split(".")[0];
        return BigInt(s);
    } catch {
        return null;
    }
}

/** bigint | null → string | null. Server Action 페이로드 직렬화용. */
export function bigIntToString(v: bigint | null): string | null {
    return v === null ? null : v.toString();
}

// ── 날짜 변환 ──────────────────────────────────────────────────────────────

/**
 * 'YYYY-MM-DD' 문자열 또는 Date (KST 기준) → unix seconds (UTC).
 * lightweight-charts time 축에 사용.
 */
export function dateToUnix(v: unknown): number {
    if (typeof v === "string") {
        const s = v.slice(0, 10);
        if (s) {
            const t = new Date(`${s}T00:00:00+09:00`);
            return Math.floor(t.getTime() / 1000);
        }
    }
    if (v instanceof Date) return Math.floor(v.getTime() / 1000);
    return 0;
}

/**
 * 'YYYY-MM-DD' + 'HH:mm:ss' (KST) → unix seconds.
 * 진입 마커 시간 계산에 사용.
 */
export function composeUnix(tradeDate: string, tradeTime: string): number | null {
    if (!tradeDate || !tradeTime) return null;
    const t = new Date(`${tradeDate.slice(0, 10)}T${tradeTime.slice(0, 8)}+09:00`);
    const sec = Math.floor(t.getTime() / 1000);
    return Number.isFinite(sec) ? sec : null;
}
