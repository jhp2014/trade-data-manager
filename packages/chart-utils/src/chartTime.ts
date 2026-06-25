// KST = UTC + 9h
const KST_OFFSET_SEC = 9 * 3600;

function toKstDate(unixSec: number): Date {
    return new Date((unixSec + KST_OFFSET_SEC) * 1000);
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

export function kstHHmm(unixSec: number): string {
    const d = toKstDate(unixSec);
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

export function kstYmd(unixSec: number): string {
    const d = toKstDate(unixSec);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** unix(초) → KST 기준 자정 이후 분(0~1439). 장 시간 비교용. */
export function kstMinutesOfDay(unixSec: number): number {
    const d = toKstDate(unixSec);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
}
