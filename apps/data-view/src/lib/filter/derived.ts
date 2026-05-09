import type { ThemeRowData } from "@/types/deck";
import type { MemberPredicate } from "@/lib/member/predicate";
import { isMember } from "@/lib/member/predicate";
import type { FilterInstance, ActivePool, RowDerived } from "./kinds/types";

export function rowKey(row: ThemeRowData): string {
    return `${row.entry.stockCode}|${row.entry.tradeDate}|${row.entry.tradeTime}|${row.themeId}`;
}

/**
 * 전체 row에 대해 각 activeMembersInTheme 인스턴스의 풀을 계산한다.
 * 필터 통과 여부와 무관하게 모든 row에 대해 수행한다 (EntryRow 렌더에서 필요).
 *
 * @param activeMemberInstances kind === "activeMembersInTheme" 인 인스턴스만 전달
 */
export function computeRowDerived(
    rows: ThemeRowData[],
    activeMemberInstances: FilterInstance[],
): Map<string, RowDerived> {
    // 인스턴스 값에서 predicate 추출 (Phase 3에서 activeMembersInTheme 값 타입이 확정되면 cast)
    const infos = activeMemberInstances.map((inst) => ({
        id: inst.id,
        predicate: (inst.value as { predicate: MemberPredicate }).predicate,
    }));

    const result = new Map<string, RowDerived>();

    for (const row of rows) {
        const activePools: ActivePool[] = infos.map(({ id, predicate }) => {
            const all = [row.self, ...row.peers];
            const members = all
                .filter((m) => isMember(m, predicate))
                .sort((a, b) => (b.closeRate ?? -Infinity) - (a.closeRate ?? -Infinity));

            const selfIdx = members.findIndex((m) => m.stockCode === row.self.stockCode);
            return {
                instanceId: id,
                selfRank: selfIdx === -1 ? null : selfIdx + 1,
                poolSize: members.length,
                members,
            };
        });

        result.set(rowKey(row), { activePools });
    }

    return result;
}
