// 되짚기 — 위 목록(걸린 필터 막대)에서 보드로 데려오는 손짓의 배선.
// 조건 이름을 누르면 그 조건이 사는 줄로 스크롤하고 잠깐 강조한다(flash).
import { useEffect, useMemo, useRef, useState } from "react";
import type { FilterStage } from "./stage.js";
import type { RailKey } from "./stageBinding.js";

/**
 * 위 목록에서 보드로 데려오는 손짓 — 조건 이름을 누르면 그 조건이 사는 줄로.
 * `at` 은 같은 줄을 다시 눌러도 다시 강조되게 하는 손도장이다.
 */
export interface BoardReveal {
    stageId: string;
    at: number;
}

export const rowIdOfKey = (k: RailKey): string => (k.kind === "axis" ? `axis:${k.axisId}` : k.kind);

/** 이 필터가 보드의 어느 줄에 사는가 — 되짚기(위 목록 → 보드)의 유일한 대응표. */
export function rowIdOfStage(s: FilterStage): string {
    const first = s.predicates[0];
    if (!first) return `group:${s.id}`;
    switch (first.kind) {
        case "group": return `group:${s.id}`;
        case "axisBand":
        case "axisValue": return `axis:${first.axisId}`;
        case "date": return "date";
        case "time": return "time";
    }
}

/** 줄 등록 + 스크롤·강조 — 보드는 registerRow 로 줄을 알려 주고 flash 로 강조 여부를 읽는다. */
export function useBoardReveal(reveal: BoardReveal | null, stages: readonly FilterStage[]): {
    registerRow: (id: string) => (el: HTMLElement | null) => void;
    flash: string | null;
} {
    const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
    const revealRowId = useMemo(() => {
        if (!reveal) return null;
        const s = stages.find((x) => x.id === reveal.stageId);
        return s ? rowIdOfStage(s) : null;
    }, [reveal, stages]);
    const [flash, setFlash] = useState<string | null>(null);
    useEffect(() => {
        if (!revealRowId) return;
        rowRefs.current.get(revealRowId)?.scrollIntoView({ block: "center", behavior: "smooth" });
        setFlash(revealRowId);
        const t = setTimeout(() => setFlash(null), 1400);
        return () => clearTimeout(t);
    }, [revealRowId, reveal?.at]);

    const registerRow = (id: string) => (el: HTMLElement | null): void => {
        if (el) rowRefs.current.set(id, el);
        else rowRefs.current.delete(id);
    };

    return { registerRow, flash };
}
