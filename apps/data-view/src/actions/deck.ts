"use server";

import {
  loadDecksFromDir,
  resolveDeckSubDir,
  analyzeEntries,
  type StockMetrics,
  DeckEntry,
} from "@trade-data-manager/feature-engine";
import "dotenv/config";
import type {
  LoadedDecksDTO,
  StockMetricsDTO,
  ThemeRowData,
} from "@/types/deck";
import { getDataViewDb } from "./db";  // ← 추가


/* ===========================================================
 * loadDeckAction
 * =========================================================== */

export async function loadDeckAction(
  subDir: string = ""
): Promise<
  | { ok: true; data: LoadedDecksDTO; rows: ThemeRowData[] }
  | { ok: false; error: string }
> {
  try {
    const absDir = resolveDeckSubDir(subDir);
    const decks = await loadDecksFromDir(absDir);

    const dto: LoadedDecksDTO = {
      entries: decks.entries.map((e) => ({
        stockCode: e.stockCode,
        tradeDate: e.tradeDate,
        tradeTime: e.tradeTime,
        options: e.options,
        sourceFile: e.sourceFile,
      })),
      optionKeys: decks.optionKeys,
      files: decks.files,
      duplicateCount: decks.duplicateCount,
    };

    if (dto.entries.length === 0) {
      return { ok: true, data: dto, rows: [] };
    }

    const db = getDataViewDb();
    const analyzed = await analyzeEntries(db, decks.entries);

    const rows: ThemeRowData[] = [];
    for (const a of analyzed) {
      const self = a.self
        ? toStockMetricsDTO(a.self)
        : null;
      if (!self) continue;

      if (a.themePeers.length === 0) {
        // 테마 없는 경우 — 한 줄만 표시 (가짜 테마)
        rows.push({
          entry: toEntryDTO(a.entry),
          self,
          themeId: "",
          themeName: "(테마 없음)",
          selfRank: 1,
          themeSize: 1,
          peers: [],
        });
        continue;
      }

      for (const g of a.themePeers) {
        // 테마 내 자기 + peer 합쳐서 등락률 순위 계산
        const all: StockMetricsDTO[] = [
          self,
          ...g.peers.map(toStockMetricsDTO),
        ];
        all.sort((a, b) => (b.closeRate ?? -Infinity) - (a.closeRate ?? -Infinity));
        const selfRank = all.findIndex((s) => s.stockCode === self.stockCode) + 1;

        rows.push({
          entry: toEntryDTO(a.entry),
          self,
          themeId: g.themeId,
          themeName: g.themeName,
          selfRank,
          themeSize: all.length,
          peers: all.filter((s) => s.stockCode !== self.stockCode),
        });
      }
    }

    return { ok: true, data: dto, rows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function toStockMetricsDTO(m: StockMetrics): StockMetricsDTO {
  return {
    stockCode: m.stockCode,
    stockName: m.stockName,
    closeRate: m.closeRate,
    cumulativeAmount:
      m.cumulativeAmount === null ? null : m.cumulativeAmount.toString(),
    dayHighRate: m.dayHighRate,
    pullbackFromHigh: m.pullbackFromHigh,
    minutesSinceDayHigh: m.minutesSinceDayHigh,
    currentMinuteAmount:
      m.currentMinuteAmount === null ? null : m.currentMinuteAmount.toString(),
    amountDistribution: m.amountDistribution,
  };
}

function toEntryDTO(e: DeckEntry) {
  return {
    stockCode: e.stockCode,
    tradeDate: e.tradeDate,
    tradeTime: e.tradeTime,
    options: e.options,
    sourceFile: e.sourceFile,
  };
}