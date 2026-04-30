/** 'YYYYMMDD' → 'YYYY-MM-DD' (Postgres date 컬럼 형식) */
export function toIsoDate(yyyymmdd: string): string {
    return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** 'YYYYMMDDHHMMSS' → 'HH:MM:SS' (Postgres time 컬럼 형식) */
export function extractTimeFromTimestamp(yyyymmddhhmmss: string): string {
    return `${yyyymmddhhmmss.slice(8, 10)}:${yyyymmddhhmmss.slice(10, 12)}:${yyyymmddhhmmss.slice(12, 14)}`;
}

/** 'YYYYMMDDHHMMSS' → unix timestamp (KST 기준) */
export function toUnixTimestampKst(yyyymmddhhmmss: string): number {
    const y = yyyymmddhhmmss.slice(0, 4);
    const mo = yyyymmddhhmmss.slice(4, 6);
    const d = yyyymmddhhmmss.slice(6, 8);
    const h = yyyymmddhhmmss.slice(8, 10);
    const mi = yyyymmddhhmmss.slice(10, 12);
    const s = yyyymmddhhmmss.slice(12, 14);
    return Math.floor(new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`).getTime() / 1000);
}
