"use client";

import { useEffect } from "react";
import { useHoveredRowStore } from "@/stores/useHoveredRowStore";
import { useChartModalStore } from "@/stores/useChartModalStore";
import {
    usePeerListModalStore,
    buildThemeEntries,
    buildActiveEntries,
} from "@/stores/usePeerListModalStore";
import type { FilterInstance } from "@/lib/filter/kinds/types";
import type { MemberPredicate } from "@/lib/member/predicate";
import { shortLabelForPredicate } from "@/lib/member/predicate";

interface Options {
    /** kind === "activeMembersInTheme" 인 인스턴스 (Act#N 라벨링용) */
    activeInstances: FilterInstance[];
}

/**
 * Row 단축키를 글로벌로 1개만 등록한다.
 *
 *  - Space : 현재 hovered row 의 차트 모달 열기
 *  - 1     : 테마 펼침 모달 열기
 *  - 2..N  : Active 풀 펼침 모달 열기 (인덱스 0-based 로 num-2)
 *
 * 가드:
 *  - ChartModal 또는 PeerListModal 이 열려있을 때는 동작하지 않는다.
 *    (해당 모달은 자체 단축키를 가짐)
 *  - INPUT / TEXTAREA / SELECT / contenteditable 에서는 무시
 *  - hovered row 가 없으면 무시
 */
export function useGlobalRowShortcuts({
    activeInstances,
}: Options): void {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.isComposing) return;

            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (
                    tag === "INPUT" ||
                    tag === "TEXTAREA" ||
                    tag === "SELECT" ||
                    target.isContentEditable
                ) return;
            }

            // 모달이 떠있으면 무시 (모달 자체가 키 입력을 처리)
            const chartTarget = useChartModalStore.getState().target;
            if (chartTarget !== null) return;
            const peerTarget = usePeerListModalStore.getState().target;
            if (peerTarget !== null) return;

            const hovered = useHoveredRowStore.getState().hovered;
            if (!hovered) return;

            const { row, activePools } = hovered;
            const { entry, self } = row;

            // Space → 차트 모달 열기
            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                useChartModalStore.getState().open({
                    stockCode: self.stockCode,
                    stockName: self.stockName,
                    tradeDate: entry.tradeDate,
                    tradeTime: entry.tradeTime,
                    themeId: row.themeId,
                    activePools: activePools.map((p) => ({
                        instanceId: p.instanceId,
                        memberStockCodes: p.members.map((m) => m.stockCode),
                    })),
                    priceLines: entry.priceLines,
                });
                return;
            }

            const num = parseInt(e.key, 10);
            if (isNaN(num) || num < 1) return;

            // 1 → 테마 펼침
            if (num === 1) {
                e.preventDefault();
                const entries = buildThemeEntries(row);
                usePeerListModalStore.getState().open({
                    kind: "theme",
                    headerChip: `#${row.themeName}`,
                    count: row.themeSize,
                    entries,
                    tradeDate: entry.tradeDate,
                    tradeTime: entry.tradeTime,
                    themeId: row.themeId,
                    sourceRow: {
                        stockCode: self.stockCode,
                        themeId: row.themeId,
                        tradeDate: entry.tradeDate,
                        tradeTime: entry.tradeTime,
                    },
                });
                return;
            }

            // 2..N → Active #(N-1)
            const pool = activePools[num - 2];
            if (!pool) return;
            e.preventDefault();
            const instIdx = activeInstances.findIndex((i) => i.id === pool.instanceId);
            const subtitle = instIdx >= 0
                ? shortLabelForPredicate(
                    (activeInstances[instIdx].value as { predicate: MemberPredicate }).predicate,
                )
                : "";
            const entries = buildActiveEntries(self.stockCode, pool.members);
            usePeerListModalStore.getState().open({
                kind: "active",
                headerChip: `Act#${num - 1}`,
                headerSubtitle: subtitle || undefined,
                count: pool.poolSize,
                entries,
                tradeDate: entry.tradeDate,
                tradeTime: entry.tradeTime,
                themeId: row.themeId,
                sourceRow: {
                    stockCode: self.stockCode,
                    themeId: row.themeId,
                    tradeDate: entry.tradeDate,
                    tradeTime: entry.tradeTime,
                    priceLines: entry.priceLines,
                },
            });
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [activeInstances]);
}
