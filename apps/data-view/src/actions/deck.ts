"use server";

import {
  loadDecksFromDir,
  resolveDeckSubDir,
  analyzeEntries,
  type StockMetrics,
} from "@trade-data-manager/feature-engine";
import { createDb } from "@trade-data-manager/feature-engine";
import { Pool } from "pg";
import "dotenv/config";
import type {
  LoadedDecksDTO,
  CardData,
  StockMetricsDTO,
} from "@/types/deck";

/* ===========================================================
 * DB pool — module-scope singleton
 *
 * Next.js dev 의 hot reload 에서 pool 이 매번 새로 생기지 않도록
 * globalThis 캐시.
 * =========================================================== */

const globalForDb = globalThis as unknown as {
  __dataViewDbPool?: Pool;
};

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "[data-view] DATABASE_URL is not set. " +
      "Add it to apps/data-view/.env.local"
    );
  }
  if (!globalForDb.__dataViewDbPool) {
    globalForDb.__dataViewDbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return createDb(globalForDb.__dataViewDbPool);
}

/* ===========================================================
 * loadDeckAction
 * =========================================================== */

export async function loadDeckAction(
  subDir: string = ""
): Promise<
  | { ok: true; data: LoadedDecksDTO; cards: CardData[] }
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
      return { ok: true, data: dto, cards: [] };
    }

    const db = getDb();
    const analyzed = await analyzeEntries(db, decks.entries);

    const cards: CardData[] = analyzed.map((a) => ({
      entry: {
        stockCode: a.entry.stockCode,
        tradeDate: a.entry.tradeDate,
        tradeTime: a.entry.tradeTime,
        options: a.entry.options,
        sourceFile: a.entry.sourceFile,
      },
      self: a.self
        ? toStockMetricsDTO(a.self)
        : {
          stockCode: a.entry.stockCode,
          stockName: a.entry.stockCode,
          closeRate: null,
          cumulativeAmount: null,
          dayHighRate: null,
          pullbackFromHigh: null,
          cnt100Amt: null,
        },
      // v0.3 까지 빈 배열
      themePeers: a.themePeers.map((g) => ({
        themeId: g.themeId,
        themeName: g.themeName,
        peers: g.peers.map(toStockMetricsDTO),
      })),
    }));

    return { ok: true, data: dto, cards };
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
    cnt100Amt: m.cnt100Amt,
  };
}
