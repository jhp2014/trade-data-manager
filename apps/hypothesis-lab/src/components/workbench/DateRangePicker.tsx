"use client";

import { useState } from "react";
import dayjs from "dayjs";
import type { DateRange } from "@/stores/workbench";
import styles from "./DateRangePicker.module.css";

type Preset = { label: string; build: () => DateRange };

const TODAY = () => dayjs().format("YYYY-MM-DD");
const PRESETS: Preset[] = [
    { label: "이번 달", build: () => ({ from: dayjs().startOf("month").format("YYYY-MM-DD"), to: TODAY() }) },
    { label: "최근 1개월", build: () => ({ from: dayjs().subtract(1, "month").format("YYYY-MM-DD"), to: TODAY() }) },
    { label: "최근 3개월", build: () => ({ from: dayjs().subtract(3, "month").format("YYYY-MM-DD"), to: TODAY() }) },
    { label: "최근 6개월", build: () => ({ from: dayjs().subtract(6, "month").format("YYYY-MM-DD"), to: TODAY() }) },
];

function fmt(d: string): string {
    return dayjs(d).format("YY.MM.DD");
}

/**
 * 기간(Date) 작업셋 범위 피커.
 * - 칩: 현재 범위를 YY.MM.DD ~ YY.MM.DD 로 표시, 클릭 시 팝오버.
 * - 팝오버: 프리셋(오늘 기준)과 직접 날짜 입력. 변경은 즉시 적용된다.
 */
export function DateRangePicker({
    range,
    setRange,
}: {
    range: DateRange;
    setRange: (r: DateRange) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className={styles.wrap}>
            <button
                type="button"
                className={styles.chip}
                onClick={() => setOpen((v) => !v)}
                title="기간 범위 지정"
                aria-expanded={open}
            >
                <span className={styles.chipText}>
                    {fmt(range.from)} ~ {fmt(range.to)}
                </span>
            </button>

            {open && (
                <>
                    <div className={styles.backdrop} onClick={() => setOpen(false)} />
                    <div className={styles.popover} role="dialog" aria-label="기간 범위">
                        <div className={styles.presets}>
                            {PRESETS.map((p) => (
                                <button
                                    key={p.label}
                                    type="button"
                                    className={styles.presetBtn}
                                    onClick={() => {
                                        setRange(p.build());
                                        setOpen(false);
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <div className={styles.fields}>
                            <input
                                type="date"
                                className={styles.input}
                                value={range.from}
                                max={range.to}
                                onChange={(e) => setRange({ ...range, from: e.target.value })}
                            />
                            <span className={styles.tilde}>~</span>
                            <input
                                type="date"
                                className={styles.input}
                                value={range.to}
                                min={range.from}
                                onChange={(e) => setRange({ ...range, to: e.target.value })}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
