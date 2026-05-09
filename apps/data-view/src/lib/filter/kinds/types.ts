import type { ComponentType } from "react";
import type { ThemeRowData, StockMetricsDTO } from "@/types/deck";
import type { OptionMeta } from "@/lib/options/optionRegistry";

export interface ActivePool {
    instanceId: string;
    /** self가 풀에 없으면 null */
    selfRank: number | null;
    poolSize: number;
    /** 등락률 내림차순 정렬, self 포함 */
    members: StockMetricsDTO[];
}

export interface RowDerived {
    /** activeMembersInTheme 인스턴스마다 1개 */
    activePools: ActivePool[];
}

export interface FilterInstance {
    id: string;
    kind: string;
    value: unknown;
}

export interface BuildCtx {
    optionKeys: string[];
    optionRegistry: Map<string, OptionMeta>;
    /** 현재 활성화된 모든 인스턴스 (다른 인스턴스 참조용) */
    activeInstances: FilterInstance[];
}

export interface FilterKind<TValue> {
    kind: string;
    label: string;
    section: "theme" | "target" | "option";
    /** true이면 같은 kind의 인스턴스를 여러 개 추가 가능 */
    multiple: boolean;
    defaultValue: (ctx: BuildCtx) => TValue;
    chipLabel: (v: TValue, ctx: BuildCtx) => string;
    match: (row: ThemeRowData, v: TValue, derived: RowDerived, instanceId: string) => boolean;
    Input: ComponentType<{
        value: TValue;
        onChange: (v: TValue) => void;
        ctx: BuildCtx;
    }>;
    serialize: (v: TValue) => string;
    deserialize: (raw: string, ctx: BuildCtx) => TValue | null;
}
