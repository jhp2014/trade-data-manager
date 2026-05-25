"use client";

import styles from "./TimeSlider.module.css";

/* ===========================================================
 * PeerListModal 의 시간 슬라이더 (헤더 인라인 배치).
 *
 *  - 범위: 08:00 ~ 20:00 (NXT 거래시간 포함)
 *  - 단위: 1분
 *  - 시간 라벨은 바 좌측에 작고 회색 (종목코드 톤)
 *  - 마우스 휠 처리는 호출자(PeerListModal) 가 Shift+휠로 모달 전체에서 처리
 *
 * fetch 디바운스는 호출자가 useDebouncedValue 로 처리.
 * =========================================================== */

const MIN_MINUTES = 8 * 60;   // 08:00
const MAX_MINUTES = 20 * 60;  // 20:00

interface Props {
    minutes: number;
    onMinutesChange: (m: number) => void;
}

export function TimeSlider({ minutes, onMinutesChange }: Props) {
    return (
        <div className={styles.wrapper}>
            <span className={styles.label}>{formatHHMM(minutes)}</span>
            <input
                type="range"
                className={styles.range}
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={1}
                value={minutes}
                onChange={(e) => onMinutesChange(Number(e.target.value))}
                aria-label="시간 선택"
                title="Shift + 휠로 ±1분"
            />
        </div>
    );
}

function formatHHMM(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${pad(h)}:${pad(min)}`;
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

/* 외부에서 "HH:MM:SS" ↔ minutes 변환이 필요할 때 사용 */

export function timeStringToMinutes(t: string): number {
    // "HH:MM" 또는 "HH:MM:SS" 둘 다 허용
    const [h, m] = t.split(":");
    return Number(h) * 60 + Number(m);
}

export function minutesToTimeString(m: number): string {
    return `${formatHHMM(m)}:00`;
}

export function clampMinutes(m: number): number {
    if (m < MIN_MINUTES) return MIN_MINUTES;
    if (m > MAX_MINUTES) return MAX_MINUTES;
    return m;
}

export { MIN_MINUTES as TIME_MIN_MINUTES, MAX_MINUTES as TIME_MAX_MINUTES };
