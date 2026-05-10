"use server";

import {
    getThemeSnapshotAt,
    STAT_AMOUNTS,
} from "@trade-data-manager/data-core";
import "dotenv/config";
import { loadDecksFromDir, resolveDeckSubDir } from "@/deck";
import type { DeckEntry } from "@/deck";
import type {
    LoadedDecksDTO,
    StockMetricsDTO,
    ThemeRowData,
} from "@/types/deck";
import { toStockMetricsDTO } from "@/lib/snapshotMapper";
import { getDataViewDb } from "./db";
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

        const db = getDataViewDb();

        const rows: ThemeRowData[] = [];
        for (const entry of decks.entries) {
            const snapshots = await getThemeSnapshotAt(db, {
                stockCode: entry.stockCode,
                tradeDate: entry.tradeDate,
                tradeTime: entry.tradeTime,
            });

            // 모든 테마에서 self 멤버는 동일 — 첫 테마의 self 사용
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

                // 테마 내 등락률 순위 계산 (self 포함)
                const all: StockMetricsDTO[] = [self, ...peerDtos];
                all.sort((a, b) => (b.closeRate ?? -Infinity) - (a.closeRate ?? -Infinity));
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
