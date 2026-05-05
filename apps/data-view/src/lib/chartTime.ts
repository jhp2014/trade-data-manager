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

export function kstYmdHm(unixSec: number): string {
    return `${kstYmd(unixSec)} ${kstHHmm(unixSec)}`;
}
