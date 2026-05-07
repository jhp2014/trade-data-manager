"use client";

import type { OptionFilter } from "@/types/filter";
import type { OptionMeta } from "@/lib/options/optionRegistry";
import { FILTERS } from "@/lib/filter/registry";
import { OptionRow } from "./inputs/OptionRow";
import styles from "./FilterPanel.module.css";

interface Props {
    filterValues: Record<string, unknown>;
    setFilterValue: (filterId: string, value: unknown) => void;
    optionFilters: OptionFilter[];
    setOptionFilters: (filters: OptionFilter[]) => void;
    optionKeys: string[];
    optionRegistry: Map<string, OptionMeta>;
}

const themeFilters = FILTERS.filter((f) => f.section === "theme");
const targetFilters = FILTERS.filter((f) => f.section === "target");

export function FilterPanel({
    filterValues,
    setFilterValue,
    optionFilters,
    setOptionFilters,
    optionKeys,
    optionRegistry,
}: Props) {
    return (
        <div className={styles.panel}>
            {/* 테마 필터 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>테마</h3>
                <div className={styles.fields}>
                    {themeFilters.map((f) => (
                        <f.Input
                            key={f.id}
                            value={filterValues[f.id]}
                            onChange={(v) => setFilterValue(f.id, v)}
                        />
                    ))}
                </div>
            </section>

            {/* Target 종목 필터 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Target 종목</h3>
                <div className={styles.fields}>
                    {targetFilters.map((f) => (
                        <f.Input
                            key={f.id}
                            value={filterValues[f.id]}
                            onChange={(v) => setFilterValue(f.id, v)}
                        />
                    ))}
                </div>
            </section>

            {/* 옵션 필터 */}
            {optionKeys.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>옵션</h3>
                    <div className={styles.fields}>
                        {optionKeys.map((key) => {
                            const meta = optionRegistry.get(key);
                            if (!meta) return null;
                            const existing = optionFilters.find((f) => f.key === key) ?? null;
                            return (
                                <OptionRow
                                    key={key}
                                    optionKey={key}
                                    meta={meta}
                                    filter={existing}
                                    onChange={(next) => {
                                        const without = optionFilters.filter((f) => f.key !== key);
                                        setOptionFilters(next ? [...without, next] : without);
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
