"use client";

import { PredicateInput } from "@/components/filter/inputs/PredicateInput";
import {
    chipLabelForPredicate,
    serializePredicate,
    deserializePredicate,
    isMember,
} from "@/lib/member/predicate";
import type { MemberPredicate } from "@/lib/member/predicate";
import type { FilterKind } from "./types";

export const targetMemberKind: FilterKind<MemberPredicate> = {
    kind: "targetMember",
    label: "Target 종목 조건",
    section: "target",
    multiple: false,
    defaultValue: () => ({ conditions: [] }),
    chipLabel: (v) => v.conditions.length === 0 ? "" : `종목: ${chipLabelForPredicate(v)}`,
    match: (row, v) => isMember(row.self, v),
    Input: ({ value, onChange }) => <PredicateInput value={value} onChange={onChange} />,
    serialize: serializePredicate,
    deserialize: (raw) => deserializePredicate(raw),
};
