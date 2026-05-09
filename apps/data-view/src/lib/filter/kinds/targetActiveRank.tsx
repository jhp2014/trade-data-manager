"use client";

import type { FilterKind, BuildCtx } from "./types";
import styles from "@/components/filter/inputs.module.css";

export interface ActiveRankValue {
    refInstanceId: string;
    rankMin: number | null;
    rankMax: number | null;
}

function RankInput({
    value,
    onChange,
    ctx,
}: {
    value: ActiveRankValue;
    onChange: (v: ActiveRankValue) => void;
    ctx: BuildCtx;
}) {
    const activeOpts = ctx.activeInstances.filter((i) => i.kind === "activeMembersInTheme");
    const invalidRef = value.refInstanceId && !activeOpts.find((i) => i.id === value.refInstanceId);

    return (
        <div>
            {invalidRef && (
                <div className={styles.row}>
                    <span style={{ color: "var(--text-warning, #e67e22)", fontSize: "var(--fs-xs)" }}>
                        ⚠ 참조 슬롯 없음 — 항상 제외됨
                    </span>
                </div>
            )}
            <div className={styles.row}>
                <label className={styles.label}>참조 슬롯</label>
                <select
                    className={styles.input}
                    value={value.refInstanceId}
                    onChange={(e) => onChange({ ...value, refInstanceId: e.target.value })}
                >
                    <option value="">— 선택 —</option>
                    {activeOpts.map((inst, i) => (
                        <option key={inst.id} value={inst.id}>
                            Act #{i + 1}
                        </option>
                    ))}
                </select>
            </div>
            <div className={styles.row}>
                <label className={styles.label}>등수 범위</label>
                <input
                    className={styles.input}
                    type="number"
                    step={1}
                    min={1}
                    placeholder="최솟값"
                    value={value.rankMin ?? ""}
                    onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        onChange({ ...value, rankMin: isNaN(n) ? null : n });
                    }}
                />
                <span className={styles.rangeSep}>~</span>
                <input
                    className={styles.input}
                    type="number"
                    step={1}
                    min={1}
                    placeholder="최댓값"
                    value={value.rankMax ?? ""}
                    onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        onChange({ ...value, rankMax: isNaN(n) ? null : n });
                    }}
                />
            </div>
        </div>
    );
}

export const targetActiveRankKind: FilterKind<ActiveRankValue> = {
    kind: "targetActiveRank",
    label: "Active 등수",
    section: "target",
    multiple: true,
    defaultValue: (ctx) => ({
        refInstanceId: ctx.activeInstances.find((i) => i.kind === "activeMembersInTheme")?.id ?? "",
        rankMin: null,
        rankMax: null,
    }),
    chipLabel: (v, ctx) => {
        const activeOpts = ctx.activeInstances.filter((i) => i.kind === "activeMembersInTheme");
        const idx = activeOpts.findIndex((i) => i.id === v.refInstanceId);
        const label = idx >= 0 ? `Act#${idx + 1}` : "?";
        if (v.rankMin !== null && v.rankMax !== null) return `${label} 등수 ${v.rankMin}~${v.rankMax}위`;
        if (v.rankMin !== null) return `${label} ≥${v.rankMin}위`;
        if (v.rankMax !== null) return `${label} ≤${v.rankMax}위`;
        return `${label} 등수`;
    },
    match: (_row, v, derived) => {
        if (!v.refInstanceId) return false;
        const pool = derived.activePools.find((p) => p.instanceId === v.refInstanceId);
        if (!pool) return false;
        const rank = pool.selfRank;
        if (rank === null) return false;
        if (v.rankMin !== null && rank < v.rankMin) return false;
        if (v.rankMax !== null && rank > v.rankMax) return false;
        return true;
    },
    Input: RankInput,
    // 직렬화: "<refId>;<rankMin>..<rankMax>"
    serialize: (v) => `${v.refInstanceId};${v.rankMin ?? ""}..${v.rankMax ?? ""}`,
    deserialize: (raw) => {
        const semiIdx = raw.indexOf(";");
        if (semiIdx === -1) return null;
        const refInstanceId = raw.slice(0, semiIdx);
        const rangeStr = raw.slice(semiIdx + 1);
        const dotIdx = rangeStr.indexOf("..");
        if (dotIdx === -1) return null;
        const minStr = rangeStr.slice(0, dotIdx);
        const maxStr = rangeStr.slice(dotIdx + 2);
        const rankMin = minStr === "" ? null : parseInt(minStr, 10);
        const rankMax = maxStr === "" ? null : parseInt(maxStr, 10);
        if (rankMin !== null && isNaN(rankMin)) return null;
        if (rankMax !== null && isNaN(rankMax)) return null;
        return { refInstanceId, rankMin, rankMax };
    },
};
