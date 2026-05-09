"use client";

import { targetMemberKind } from "./targetMember";
import { activeMembersInThemeKind } from "./activeMembersInTheme";
import { targetActiveRankKind } from "./targetActiveRank";
import { stockCodeKind } from "./stockCode";
import { dateRangeKind } from "./dateRange";
import { timeRangeKind } from "./timeRange";
import { optionKind } from "./option";
import type { FilterKind } from "./types";

export const KINDS: Record<string, FilterKind<any>> = { // any: 다형 레지스트리
    targetMember: targetMemberKind,
    activeMembersInTheme: activeMembersInThemeKind,
    targetActiveRank: targetActiveRankKind,
    stockCode: stockCodeKind,
    dateRange: dateRangeKind,
    timeRange: timeRangeKind,
    option: optionKind,
};

export type { FilterKind, FilterInstance, BuildCtx, RowDerived, ActivePool } from "./types";
