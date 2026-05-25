"use client";

import { useEffect, useRef } from "react";
import styles from "./TimeSlider.module.css";

/* ===========================================================
 * PeerListModal 의 시간 슬라이더.
 *
 *  - 범위: 08:00 ~ 20:00 (NXT 거래시간 포함)
 *  - 단위: 1분
 *  - 마우스 휠로 ±1분 조작 가능
 *  - 슬라이더 위에 현재 선택 시간을 큰 글씨로 표시
 *
 * fetch 디바운스는 호출자(PeerListModal) 가 useDebouncedValue 로 처리한다.
 * 슬라이더 자체는 raw 값만 부드럽게 흘려보낸다.
 * =========================================================== */

const MIN_MINUTES = 8 * 60;   // 08:00
const MAX_MINUTES = 20 * 60;  // 20:00

interface Props {
    minutes: number;
    onMinutesChange: (m: number) => void;
}

export function TimeSlider({ minutes, onMinutesChange }: Props) {
    const wrapperRef = useRef<HTMLDivElement>(null);

    // 휠 핸들러는 native passive=false 로 등록해야 preventDefault 가 동작.
    // closure 캡처 문제를 피하기 위해 minutes 는 ref 로 lift.
    const minutesRef = useRef(minutes);
    useEffect(() => {
        minutesRef.current = minutes;
    }, [minutes]);

    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1; // 위로 굴리면 시간 증가
            const next = clamp(minutesRef.current + delta);
            if (next !== minutesRef.current) onMinutesChange(next);
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, [onMinutesChange]);

    return (
        <div className={styles.wrapper} ref={wrapperRef}>
            <div className={styles.label}>{formatHHMM(minutes)}</div>
            <input
                type="range"
                className={styles.range}
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={1}
                value={minutes}
                onChange={(e) => onMinutesChange(Number(e.target.value))}
                aria-label="시간 선택"
            />
        </div>
    );
}

function clamp(m: number): number {
    if (m < MIN_MINUTES) return MIN_MINUTES;
    if (m > MAX_MINUTES) return MAX_MINUTES;
    return m;
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
