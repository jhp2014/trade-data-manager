import type { OutcomeColor, OutcomeOption } from "@/domain/outcome";
import type { Case } from "@/domain/types";

export type OutcomeAggItem = {
    /** 옵션 value, 또는 미설정 버킷 "__none". */
    key: string;
    label: string;
    /** null = 중립(미설정/삭제된 종류) 표시. */
    color: OutcomeColor | null;
    count: number;
};

/**
 * caseId 집합의 outcome 을 집계한다(순수 함수).
 * - 알려진 옵션은 options 순서로, count>0 인 것만 포함.
 * - null(미설정) + 모르는 value(삭제된 종류)는 "미설정" 한 버킷으로 합산해 맨 뒤에 둔다.
 */
export function aggregateOutcomes(params: {
    caseIds: string[];
    cases: Pick<Case, "caseId" | "outcome">[];
    options: readonly OutcomeOption[];
}): { items: OutcomeAggItem[]; total: number } {
    const outcomeById = new Map(params.cases.map((c) => [c.caseId, c.outcome]));
    const counts = new Map<string, number>(); // value 키(null 은 "")
    for (const id of params.caseIds) {
        const k = outcomeById.get(id) ?? "";
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const known = new Set(params.options.map((o) => o.value));
    const items: OutcomeAggItem[] = [];
    for (const o of params.options) {
        const n = counts.get(o.value) ?? 0;
        if (n > 0) items.push({ key: o.value, label: o.label, color: o.color, count: n });
    }
    let none = 0;
    for (const [k, n] of counts) {
        if (k === "" || !known.has(k)) none += n;
    }
    if (none > 0) items.push({ key: "__none", label: "미설정", color: null, count: none });

    return { items, total: params.caseIds.length };
}
