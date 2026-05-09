import type { StockMetricsDTO } from "@/types/deck";
import type { Condition } from "@/lib/condition/types";
import {
    evalCondition,
    serializeCondition,
    deserializeCondition,
    CONDITION_KINDS,
} from "@/lib/condition";

export interface MemberPredicate {
    name?: string;
    conditions: Condition[];
}

export function isMember(m: StockMetricsDTO, p: MemberPredicate): boolean {
    return p.conditions.every((c) => evalCondition(m, c));
}

export function chipLabelForPredicate(p: MemberPredicate): string {
    if (p.name) return p.name;
    if (p.conditions.length === 0) return "(조건 없음)";
    return p.conditions
        .map((c) => {
            const kind = CONDITION_KINDS[c.kind];
            return kind ? kind.chipFragment(c.value) : c.kind;
        })
        .join(", ");
}

/** conditions 배열을 `;`으로 join: "rate:5..30;cumAmount:100" */
export function serializePredicate(p: MemberPredicate): string {
    return p.conditions.map(serializeCondition).join(";");
}

export function deserializePredicate(raw: string): MemberPredicate {
    if (!raw) return { conditions: [] };
    const conditions = raw
        .split(";")
        .map(deserializeCondition)
        .filter((c): c is Condition => c !== null);
    return { conditions };
}
