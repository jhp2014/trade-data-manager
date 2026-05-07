"use client";

import type { FilterState } from "@/types/filter";
import { RangeInput } from "./inputs/RangeInput";
import { TextMultiInput } from "./inputs/TextMultiInput";
import { OptionRow } from "./inputs/OptionRow";
import styles from "./FilterPanel.module.css";

interface Props {
    filter: FilterState;
    setFilter: (patch: Partial<FilterState>) => void;
    optionKeys: string[];
}

export function FilterPanel({ filter, setFilter, optionKeys }: Props) {
    return (
        <div className={styles.panel}>
            {/* 테마 필터 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>테마</h3>
                <div className={styles.fields}>
                    <RangeInput
                        label="종목 수"
                        minValue={filter.themeSizeRange.min}
                        maxValue={filter.themeSizeRange.max}
                        onMinChange={(v) => setFilter({ themeSizeRange: { ...filter.themeSizeRange, min: v } })}
                        onMaxChange={(v) => setFilter({ themeSizeRange: { ...filter.themeSizeRange, max: v } })}
                        step={1}
                    />

                    <div className={styles.slotGroup}>
                        <span className={styles.slotHint}>
                            (등락률 / 누적대금) 조건을 만족하는 종목이 N개 이상인 테마만 표시
                        </span>
                        <RangeInput
                            label="슬롯 등락률"
                            minValue={filter.themeMemberSlot.rateMin}
                            maxValue={filter.themeMemberSlot.rateMax}
                            onMinChange={(v) => setFilter({ themeMemberSlot: { ...filter.themeMemberSlot, rateMin: v } })}
                            onMaxChange={(v) => setFilter({ themeMemberSlot: { ...filter.themeMemberSlot, rateMax: v } })}
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
                                    value={filter.themeMemberSlot.amountMin ?? ""}
                                    onChange={(e) => {
                                        const n = parseFloat(e.target.value);
                                        setFilter({ themeMemberSlot: { ...filter.themeMemberSlot, amountMin: isNaN(n) ? null : n } });
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
                                    value={filter.themeMemberSlot.countMin ?? ""}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        setFilter({ themeMemberSlot: { ...filter.themeMemberSlot, countMin: isNaN(n) ? null : n } });
                                    }}
                                    aria-label="만족 종목 최솟값"
                                />
                                <span className={styles.unit}>개</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Target 종목 필터 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Target 종목</h3>
                <div className={styles.fields}>
                    <TextMultiInput
                        label="종목 코드"
                        values={filter.stockCodes}
                        onChange={(v) => setFilter({ stockCodes: v })}
                        placeholder="예: 005930, 000660"
                    />
                    <DateRangeRow
                        from={filter.dateRange.from}
                        to={filter.dateRange.to}
                        onFromChange={(v) => setFilter({ dateRange: { ...filter.dateRange, from: v } })}
                        onToChange={(v) => setFilter({ dateRange: { ...filter.dateRange, to: v } })}
                    />
                    <TimeRangeRow
                        from={filter.timeRange.from}
                        to={filter.timeRange.to}
                        onFromChange={(v) => setFilter({ timeRange: { ...filter.timeRange, from: v } })}
                        onToChange={(v) => setFilter({ timeRange: { ...filter.timeRange, to: v } })}
                    />
                    <RangeInput
                        label="등락률 (%)"
                        minValue={filter.closeRateRange.min}
                        maxValue={filter.closeRateRange.max}
                        onMinChange={(v) => setFilter({ closeRateRange: { ...filter.closeRateRange, min: v } })}
                        onMaxChange={(v) => setFilter({ closeRateRange: { ...filter.closeRateRange, max: v } })}
                        placeholder={{ min: "예: 5", max: "예: 30" }}
                        step={0.1}
                    />
                    <RangeInput
                        label="등수"
                        minValue={filter.rankRange.min}
                        maxValue={filter.rankRange.max}
                        onMinChange={(v) => setFilter({ rankRange: { ...filter.rankRange, min: v } })}
                        onMaxChange={(v) => setFilter({ rankRange: { ...filter.rankRange, max: v } })}
                        step={1}
                    />
                    <RangeInput
                        label="풀백 (%)"
                        minValue={filter.pullbackRange.min}
                        maxValue={filter.pullbackRange.max}
                        onMinChange={(v) => setFilter({ pullbackRange: { ...filter.pullbackRange, min: v } })}
                        onMaxChange={(v) => setFilter({ pullbackRange: { ...filter.pullbackRange, max: v } })}
                        placeholder={{ min: "예: -10", max: "예: 0" }}
                        step={0.1}
                    />
                    <RangeInput
                        label="고점 경과(분)"
                        minValue={filter.minutesSinceHighRange.min}
                        maxValue={filter.minutesSinceHighRange.max}
                        onMinChange={(v) => setFilter({ minutesSinceHighRange: { ...filter.minutesSinceHighRange, min: v } })}
                        onMaxChange={(v) => setFilter({ minutesSinceHighRange: { ...filter.minutesSinceHighRange, max: v } })}
                        step={1}
                    />
                </div>
            </section>

            {/* 옵션 필터 */}
            {optionKeys.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>옵션</h3>
                    <div className={styles.fields}>
                        {optionKeys.map((key) => {
                            const existing = filter.optionFilters.find((f) => f.key === key);
                            return (
                                <OptionRow
                                    key={key}
                                    optionKey={key}
                                    needle={existing?.needle ?? ""}
                                    onChange={(needle) => {
                                        const without = filter.optionFilters.filter((f) => f.key !== key);
                                        setFilter({
                                            optionFilters: needle ? [...without, { key, needle }] : without,
                                        });
                                    }}
                                />
                            );
                        })}
                    </div>
                </section>
            )}
        </div>
    );
}

function DateRangeRow({
    from, to, onFromChange, onToChange,
}: { from: string | null; to: string | null; onFromChange: (v: string | null) => void; onToChange: (v: string | null) => void }) {
    return (
        <div className={styles.dateRow}>
            <label className={styles.label}>날짜 범위</label>
            <div className={styles.dateInputs}>
                <input
                    className={styles.dateInput}
                    type="date"
                    value={from ?? ""}
                    onChange={(e) => onFromChange(e.target.value || null)}
                    aria-label="시작 날짜"
                />
                <span className={styles.dateSep}>~</span>
                <input
                    className={styles.dateInput}
                    type="date"
                    value={to ?? ""}
                    onChange={(e) => onToChange(e.target.value || null)}
                    aria-label="종료 날짜"
                />
            </div>
        </div>
    );
}

function TimeRangeRow({
    from, to, onFromChange, onToChange,
}: { from: string | null; to: string | null; onFromChange: (v: string | null) => void; onToChange: (v: string | null) => void }) {
    return (
        <div className={styles.dateRow}>
            <label className={styles.label}>시간 범위</label>
            <div className={styles.dateInputs}>
                <input
                    className={styles.dateInput}
                    type="time"
                    step="60"
                    value={from ? from.slice(0, 5) : ""}
                    onChange={(e) => onFromChange(e.target.value ? `${e.target.value}:00` : null)}
                    aria-label="시작 시간"
                />
                <span className={styles.dateSep}>~</span>
                <input
                    className={styles.dateInput}
                    type="time"
                    step="60"
                    value={to ? to.slice(0, 5) : ""}
                    onChange={(e) => onToChange(e.target.value ? `${e.target.value}:00` : null)}
                    aria-label="종료 시간"
                />
            </div>
        </div>
    );
}
