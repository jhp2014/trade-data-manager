"use client";

import type { ThemeMemberSlotFilter } from "@/types/filter";
import { RangeInput } from "./RangeInput";
import styles from "../FilterPanel.module.css";

interface Props {
    value: ThemeMemberSlotFilter;
    onChange: (v: ThemeMemberSlotFilter) => void;
}

export function ThemeMemberSlotInput({ value, onChange }: Props) {
    return (
        <div className={styles.slotGroup}>
            <span className={styles.slotHint}>
                (등락률 / 누적대금) 조건을 만족하는 종목이 N개 이상인 테마만 표시
            </span>
            <RangeInput
                label="슬롯 등락률"
                minValue={value.rateMin}
                maxValue={value.rateMax}
                onMinChange={(n) => onChange({ ...value, rateMin: n })}
                onMaxChange={(n) => onChange({ ...value, rateMax: n })}
                placeholder={{ min: "예: 5", max: "예: 30" }}
                step={0.1}
            />
            <div className={styles.fields}>
                <div className={styles.singleRow}>
                    <label className={styles.label}>슬롯 대금 ≥</label>
                    <input
                        className={styles.singleInput}
                        type="number"
                        step={1}
                        placeholder="억"
                        value={value.amountMin ?? ""}
                        onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            onChange({ ...value, amountMin: isNaN(n) ? null : n });
                        }}
                        aria-label="슬롯 대금 최솟값(억)"
                    />
                    <span className={styles.unit}>억</span>
                </div>
                <div className={styles.singleRow}>
                    <label className={styles.label}>만족 종목 ≥</label>
                    <input
                        className={styles.singleInput}
                        type="number"
                        step={1}
                        placeholder="개"
                        value={value.countMin ?? ""}
                        onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            onChange({ ...value, countMin: isNaN(n) ? null : n });
                        }}
                        aria-label="만족 종목 최솟값"
                    />
                    <span className={styles.unit}>개</span>
                </div>
            </div>
        </div>
    );
}
