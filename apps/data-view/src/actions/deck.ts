"use server";

import {
    getThemeSnapshotAt,
    STAT_AMOUNTS,
} from "@trade-data-manager/data-core";
import { loadDecksFromDir, resolveDeckSubDir } from "@/deck";
import type { DeckEntry } from "@/deck";
import type {
    LoadedDecksDTO,
    StockMetricsDTO,
    ThemeRowData,
} from "@/types/deck";
import { toStockMetricsDTO } from "@/lib/snapshotMapper";
import { sortByCloseRateDesc } from "@/lib/sort/sortByCloseRateDesc";
import { getDb } from "./db";
import { type Result, okResult, errResult } from "@/lib/result";

type DeckActionPayload = { data: LoadedDecksDTO; rows: ThemeRowData[] };

/* ===========================================================
 * loadDeckAction
 * =========================================================== */
export async function loadDeckAction(
    subDir: string = ""
): Promise<Result<DeckActionPayload>> {
    try {
        const absDir = resolveDeckSubDir(subDir);
        const decks = await loadDecksFromDir(absDir);

        const dto: LoadedDecksDTO = {
            entries: decks.entries.map((e) => ({
                stockCode: e.stockCode,
                tradeDate: e.tradeDate,
                tradeTime: e.tradeTime,
                options: e.options,
                priceLines: e.priceLines,
                sourceFile: e.sourceFile,
            })),
            optionKeys: decks.optionKeys,
            priceLineKeys: decks.priceLineKeys,
            files: decks.files,
            duplicateCount: decks.duplicateCount,
        };

        if (dto.entries.length === 0) {
            return okResult({ data: dto, rows: [] });
        }

        const db = getDb();

        // 모든 entry에 대해 DB 스냅샷을 병렬로 조회
        const snapshotsPerEntry = await Promise.all(
            decks.entries.map((entry) =>
                getThemeSnapshotAt(db, {
                    stockCode: entry.stockCode,
                    tradeDate: entry.tradeDate,
                    tradeTime: entry.tradeTime,
                }).then((snapshots) => ({ entry, snapshots })),
            ),
        );

        const rows: ThemeRowData[] = [];
        for (const { entry, snapshots } of snapshotsPerEntry) {
            // 첫 번째 self 멤버를 찾아 self 메트릭을 추출
            const selfMember = snapshots
                .map((s) => s.members.find((m) => m.isSelf))
                .find((m) => m);
            if (!selfMember) continue;

            const self = toStockMetricsDTO(selfMember, STAT_AMOUNTS);
            if (!self) continue;

            const allThemesForEntry = snapshots.map((s) => ({
                themeId: s.themeId,
                themeName: s.themeName,
            }));

            for (const snap of snapshots) {
                const peerDtos: StockMetricsDTO[] = snap.members
                    .filter((m) => !m.isSelf)
                    .map((m) => toStockMetricsDTO(m, STAT_AMOUNTS));

                // closeRate 내림차순. carry-forward 후에도 null 인 멤버(그날 첫 거래 전)는 맨 뒤.
                // See: docs/decisions/018-carry-forward-vi-feature.md
                const all: StockMetricsDTO[] = sortByCloseRateDesc([self, ...peerDtos]);
                const selfRank = all.findIndex((s) => s.stockCode === self.stockCode) + 1;

                rows.push({
                    entry: toEntryDTO(entry),
                    self,
                    themeId: snap.themeId,
                    themeName: snap.themeName,
                    selfRank,
                    themeSize: all.length,
                    peers: all.filter((s) => s.stockCode !== self.stockCode),
                    allThemesForEntry,
                });
            }
        }

        return okResult({ data: dto, rows });
    } catch (err) {
        return errResult(err);
    }
}

function toEntryDTO(e: DeckEntry) {
    return {
        stockCode: e.stockCode,
        tradeDate: e.tradeDate,
        tradeTime: e.tradeTime,
        options: e.options,
        priceLines: e.priceLines,
        sourceFile: e.sourceFile,
    };
}
