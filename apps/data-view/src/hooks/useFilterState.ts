"use client";

import { useCallback, useMemo } from "react";
import { useQueryStates, parseAsArrayOf, parseAsString } from "nuqs";
import { KINDS } from "@/lib/filter/kinds";
import { newInstanceId } from "@/lib/filter/id";
import { serializeInstance, deserializeInstance } from "@/lib/filter/url";
import type { FilterInstance, BuildCtx } from "@/lib/filter/kinds/types";
import type { OptionMeta } from "@/lib/options/optionRegistry";

const fParsers = {
    f: parseAsArrayOf(parseAsString),
};

export interface FilterChip {
    id: string;
    label: string;
    instanceId: string;
}

function buildEmptyCtx(
    optionKeys: string[],
    optionRegistry: Map<string, OptionMeta>,
    instances: FilterInstance[],
): BuildCtx {
    return { optionKeys, optionRegistry, activeInstances: instances };
}

export function useFilterState(
    optionKeys: string[] = [],
    optionRegistry: Map<string, OptionMeta> = new Map(),
) {
    const [params, setParams] = useQueryStates(fParsers, { history: "replace" });

    const instances: FilterInstance[] = useMemo(() => {
        const rawList = params.f ?? [];
        // 먼저 id/kind만 추출해 ctx 구성 (refInstanceId 역참조 지원)
        const partial = rawList
            .map((raw) => {
                const first = raw.indexOf(":");
                const second = first !== -1 ? raw.indexOf(":", first + 1) : -1;
                if (first === -1 || second === -1) return null;
                return { id: raw.slice(0, first), kind: raw.slice(first + 1, second), value: null };
            })
            .filter((x): x is { id: string; kind: string; value: null } => x !== null);

        const partialInstances = partial.map((p) => ({ ...p, value: {} as unknown }));
        const ctx = buildEmptyCtx(optionKeys, optionRegistry, partialInstances);

        return rawList
            .map((raw) => deserializeInstance(raw, KINDS, ctx))
            .filter((inst): inst is FilterInstance => inst !== null);
    }, [params.f, optionKeys, optionRegistry]);

    const ctx = useMemo(
        () => buildEmptyCtx(optionKeys, optionRegistry, instances),
        [optionKeys, optionRegistry, instances],
    );

    const addInstance = useCallback(
        (kind: string) => {
            const kindDef = KINDS[kind];
            if (!kindDef) return;
            const newInst: FilterInstance = {
                id: newInstanceId(),
                kind,
                value: kindDef.defaultValue(ctx),
            };
            const next = [...instances, newInst];
            setParams({
                f: next.map((inst) => serializeInstance(inst, KINDS)).filter(Boolean),
            });
        },
        [instances, ctx, setParams],
    );

    const updateInstance = useCallback(
        (id: string, value: unknown) => {
            const next = instances.map((inst) =>
                inst.id === id ? { ...inst, value } : inst,
            );
            setParams({
                f: next.map((inst) => serializeInstance(inst, KINDS)).filter(Boolean),
            });
        },
        [instances, setParams],
    );

    const removeInstance = useCallback(
        (id: string) => {
            const next = instances.filter((inst) => inst.id !== id);
            setParams({
                f: next.length > 0
                    ? next.map((inst) => serializeInstance(inst, KINDS)).filter(Boolean)
                    : null,
            });
        },
        [instances, setParams],
    );

    const clearAll = useCallback(() => {
        setParams({ f: null });
    }, [setParams]);

    const activeChips: FilterChip[] = useMemo(() => {
        return instances
            .filter((inst) => {
                // 빈 상태 칩은 표시 안 함 (예: targetMember with conditions.length === 0)
                const kind = KINDS[inst.kind];
                if (!kind) return false;
                const label = kind.chipLabel(inst.value, ctx);
                return label.length > 0;
            })
            .map((inst) => {
                const kind = KINDS[inst.kind]!;
                return {
                    id: inst.id,
                    label: kind.chipLabel(inst.value, ctx),
                    instanceId: inst.id,
                };
            });
    }, [instances, ctx]);

    return {
        instances,
        ctx,
        addInstance,
        updateInstance,
        removeInstance,
        clearAll,
        activeChips,
    };
}
