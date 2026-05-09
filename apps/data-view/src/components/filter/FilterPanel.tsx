"use client";

import { useEffect, type ComponentType } from "react";
import { KINDS } from "@/lib/filter/kinds";
import type { FilterInstance, BuildCtx } from "@/lib/filter/kinds/types";
import styles from "./FilterPanel.module.css";

interface Props {
    instances: FilterInstance[];
    ctx: BuildCtx;
    addInstance: (kind: string) => void;
    updateInstance: (id: string, value: unknown) => void;
    removeInstance: (id: string) => void;
}

/** multiple: false 종류를 위한 단일 필터 행 */
function SingleFilterSection({
    kind,
    inst,
    ctx,
    addInstance,
    updateInstance,
    removeInstance,
}: {
    kind: string;
    inst: FilterInstance | undefined;
    ctx: BuildCtx;
    addInstance: (kind: string) => void;
    updateInstance: (id: string, value: unknown) => void;
    removeInstance: (id: string) => void;
}) {
    const kindDef = KINDS[kind];
    if (!kindDef) return null;
    const Input = kindDef.Input as ComponentType<{
        value: any; // any: 다형
        onChange: (v: any) => void;
        ctx: BuildCtx;
    }>;

    if (!inst) {
        return (
            <div className={styles.singleFilterRow}>
                <span className={styles.singleFilterAdd}>
                    {kindDef.label}:{" "}
                    <button
                        type="button"
                        className={styles.singleFilterAddBtn}
                        onClick={() => addInstance(kind)}
                    >
                        + 추가
                    </button>
                </span>
            </div>
        );
    }

    return (
        <div className={styles.singleFilterRow}>
            <div style={{ flex: 1 }}>
                <Input
                    value={inst.value}
                    onChange={(v) => updateInstance(inst.id, v)}
                    ctx={ctx}
                />
            </div>
            <button
                type="button"
                className={styles.singleFilterClear}
                onClick={() => removeInstance(inst.id)}
                title="필터 제거"
            >
                ×
            </button>
        </div>
    );
}

/** multiple: true 종류를 위한 카드 목록 */
function MultiFilterSection({
    kind,
    instances,
    ctx,
    addInstance,
    updateInstance,
    removeInstance,
    indexPrefix,
}: {
    kind: string;
    instances: FilterInstance[];
    ctx: BuildCtx;
    addInstance: (kind: string) => void;
    updateInstance: (id: string, value: unknown) => void;
    removeInstance: (id: string) => void;
    indexPrefix: string;
}) {
    const kindDef = KINDS[kind];
    if (!kindDef) return null;
    const Input = kindDef.Input as ComponentType<{
        value: any; // any: 다형
        onChange: (v: any) => void;
        ctx: BuildCtx;
    }>;

    return (
        <div className={styles.fields}>
            {instances.map((inst, i) => (
                <div key={inst.id} className={styles.instanceCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardTitle}>{indexPrefix} #{i + 1}</span>
                        <button
                            type="button"
                            className={styles.cardRemoveBtn}
                            onClick={() => removeInstance(inst.id)}
                            aria-label="인스턴스 제거"
                        >
                            ×
                        </button>
                    </div>
                    <Input
                        value={inst.value}
                        onChange={(v) => updateInstance(inst.id, v)}
                        ctx={ctx}
                    />
                </div>
            ))}
            <button
                type="button"
                className={styles.addInstanceBtn}
                onClick={() => addInstance(kind)}
            >
                + {kindDef.label} 추가
            </button>
        </div>
    );
}

export function FilterPanel({
    instances,
    ctx,
    addInstance,
    updateInstance,
    removeInstance,
}: Props) {
    // targetMember는 항상 1개 유지 (없으면 자동 생성)
    const targetMemberInst = instances.find((i) => i.kind === "targetMember");
    useEffect(() => {
        if (!targetMemberInst) {
            addInstance("targetMember");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activeMembersInsts = instances.filter((i) => i.kind === "activeMembersInTheme");
    const activeRankInsts = instances.filter((i) => i.kind === "targetActiveRank");
    const optionInsts = instances.filter((i) => i.kind === "option");
    const stockCodeInst = instances.find((i) => i.kind === "stockCode");
    const stockNameInst = instances.find((i) => i.kind === "stockName");
    const dateRangeInst = instances.find((i) => i.kind === "dateRange");
    const timeRangeInst = instances.find((i) => i.kind === "timeRange");

    const TargetMemberInput = targetMemberInst
        ? (KINDS.targetMember.Input as ComponentType<{ value: any; onChange: (v: any) => void; ctx: BuildCtx }>)
        : null;

    return (
        <div className={styles.panel}>
            {/* 기본 필터: 종목, 날짜, 시간 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>기본 필터</h3>
                <div className={styles.fields}>
                    <SingleFilterSection
                        kind="stockCode"
                        inst={stockCodeInst}
                        ctx={ctx}
                        addInstance={addInstance}
                        updateInstance={updateInstance}
                        removeInstance={removeInstance}
                    />
                    <SingleFilterSection
                        kind="stockName"
                        inst={stockNameInst}
                        ctx={ctx}
                        addInstance={addInstance}
                        updateInstance={updateInstance}
                        removeInstance={removeInstance}
                    />
                    <SingleFilterSection
                        kind="dateRange"
                        inst={dateRangeInst}
                        ctx={ctx}
                        addInstance={addInstance}
                        updateInstance={updateInstance}
                        removeInstance={removeInstance}
                    />
                    <SingleFilterSection
                        kind="timeRange"
                        inst={timeRangeInst}
                        ctx={ctx}
                        addInstance={addInstance}
                        updateInstance={updateInstance}
                        removeInstance={removeInstance}
                    />
                </div>
            </section>

            {/* Target 종목 조건 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Target 종목 조건</h3>
                {targetMemberInst && TargetMemberInput ? (
                    <TargetMemberInput
                        value={targetMemberInst.value}
                        onChange={(v) => updateInstance(targetMemberInst.id, v)}
                        ctx={ctx}
                    />
                ) : (
                    <button
                        type="button"
                        className={styles.addInstanceBtn}
                        onClick={() => addInstance("targetMember")}
                    >
                        + Target 종목 조건 추가
                    </button>
                )}
            </section>

            {/* Active 멤버 슬롯 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Active 멤버 슬롯</h3>
                <MultiFilterSection
                    kind="activeMembersInTheme"
                    instances={activeMembersInsts}
                    ctx={ctx}
                    addInstance={addInstance}
                    updateInstance={updateInstance}
                    removeInstance={removeInstance}
                    indexPrefix="Act"
                />
            </section>

            {/* Target 활성 등수 */}
            {(activeRankInsts.length > 0 || activeMembersInsts.length > 0) && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Target 활성 등수</h3>
                    <MultiFilterSection
                        kind="targetActiveRank"
                        instances={activeRankInsts}
                        ctx={ctx}
                        addInstance={addInstance}
                        updateInstance={updateInstance}
                        removeInstance={removeInstance}
                        indexPrefix="등수"
                    />
                </section>
            )}

            {/* 옵션 필터 */}
            {ctx.optionKeys.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>옵션</h3>
                    <MultiFilterSection
                        kind="option"
                        instances={optionInsts}
                        ctx={ctx}
                        addInstance={addInstance}
                        updateInstance={updateInstance}
                        removeInstance={removeInstance}
                        indexPrefix="옵션"
                    />
                </section>
            )}
        </div>
    );
}

