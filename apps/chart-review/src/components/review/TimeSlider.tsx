/* ===========================================================
 * 마커(tradeTime) 시간 유틸 — 분↔"HH:MM" 변환 및 범위 클램프.
 *  - 범위: 08:00 ~ 20:00 (NXT 거래시간 포함)
 *  - 단위: 1분
 * (이전의 헤더 시간 슬라이더 UI 는 제거됨. a/d·Shift+휠·Shift+클릭 등
 *  다양한 수단으로 마커 시간을 조절하므로 슬라이더 바가 불필요해졌다.)
 * =========================================================== */

const MIN_MINUTES = 8 * 60; // 08:00
const MAX_MINUTES = 20 * 60; // 20:00

export function formatHHMM(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${pad(h)}:${pad(min)}`;
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

/** "HH:MM" 또는 "HH:MM:SS" → minutes. 빈 값/비정상은 null. */
export function timeStringToMinutes(t: string | undefined): number | null {
    if (!t) return null;
    const [h, m] = t.split(":");
    const minutes = Number(h) * 60 + Number(m);
    return Number.isFinite(minutes) ? minutes : null;
}

/** minutes → "HH:MM:SS". */
export function minutesToTimeString(m: number): string {
    return `${formatHHMM(m)}:00`;
}

export function clampMinutes(m: number): number {
    if (m < MIN_MINUTES) return MIN_MINUTES;
    if (m > MAX_MINUTES) return MAX_MINUTES;
    return m;
}

export { MIN_MINUTES as TIME_MIN_MINUTES, MAX_MINUTES as TIME_MAX_MINUTES };
