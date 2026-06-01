"use client";

import styles from "./TimeSlider.module.css";

/* ===========================================================
 * 마커(tradeTime) 시간 슬라이더 — 헤더 컨트롤 인라인 배치.
 *  - 범위: 08:00 ~ 20:00 (NXT 거래시간 포함)
 *  - 단위: 1분
 *  - Shift+휠 처리는 호출자(ReviewWorkspace)가 담당.
 * data-view list/TimeSlider 를 chart-review 로 이식.
 * =========================================================== */

const MIN_MINUTES = 8 * 60; // 08:00
const MAX_MINUTES = 20 * 60; // 20:00

interface Props {
    minutes: number;
    onMinutesChange: (m: number) => void;
}

export function TimeSlider({ minutes, onMinutesChange }: Props) {
    return (
        <div className={styles.wrapper} title="Shift + 휠로 ±1분">
            <span className={styles.label}>{formatHHMM(minutes)}</span>
            <input
                type="range"
                className={styles.range}
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={1}
                value={minutes}
                onChange={(e) => onMinutesChange(Number(e.target.value))}
                aria-label="마커 시간 선택"
            />
        </div>
    );
}

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
