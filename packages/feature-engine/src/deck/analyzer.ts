import { and, eq, inArray, sql } from "drizzle-orm";
import {
    stocks,
    dailyCandles,
    dailyThemeMappings,
    themes,
} from "@trade-data-manager/market-data";
import type { Database } from "../index";
import type {
    DeckEntry,
    AnalyzedEntry,
    StockMetrics,
    ThemePeerGroup,
} from "./types";

/**
 * deck entries 의 자기 분봉 피처, 종목명, 같은 테마 동반 종목들의 분봉 피처를 조립.
 *
 * 쿼리 구성 (모두 IN-list):
 *   1) self minute_candle_features  ─ (stockCode, tradeDate, tradeTime) 튜플
 *   2) (stockCode, tradeDate) → dailyCandleId, themeId, themeName
 *   3) (themeId, tradeDate) → 같은 테마 종목들의 dailyCandleId, stockCode
 *   4) peer minute_candle_features  ─ (stockCode, tradeDate, tradeTime) 튜플
 *   5) stocks  ─ stockCode → stockName  (entry+peer 합집합)
 */
export async function analyzeEntries(
    db: Database,
    entries: readonly DeckEntry[]
): Promise<AnalyzedEntry[]> {
    if (entries.length === 0) return [];

    // 1) self 분봉 피처
    const selfFeatureMap = await fetchFeatures(db, entries);

    // 2) entry 종목들의 그날 속한 테마 (stockCode|tradeDate → ThemeInfo[])
    const stockDateThemes = await fetchThemesForEntries(db, entries);

    // 3) 같은 (themeId, tradeDate) 의 동반 종목 코드들 (themeId|tradeDate → stockCode[])
    const themePeerCodes = await fetchPeerStockCodes(db, stockDateThemes);

    // 4) peer 분봉 피처 (자기 시점에 모든 peer 종목)
    const peerEntries = buildPeerFeatureEntries(entries, stockDateThemes, themePeerCodes);
    const peerFeatureMap = await fetchFeatures(db, peerEntries);

    // 5) 종목명 (entry + peer 합집합)
    const allStockCodes = new Set<string>();
    for (const e of entries) allStockCodes.add(e.stockCode);
    for (const list of themePeerCodes.values()) {
        for (const code of list) allStockCodes.add(code);
    }
    const stockNameMap = await fetchStockNames(db, Array.from(allStockCodes));

    // 6) 결과 조립
    return entries.map((entry) => {
        const selfRow = selfFeatureMap.get(makeKey(entry.stockCode, entry.tradeDate, entry.tradeTime));
        const self = buildMetrics(entry.stockCode, stockNameMap, selfRow);

        const sdKey = `${entry.stockCode}|${entry.tradeDate}`;
        const themeInfos = stockDateThemes.get(sdKey) ?? [];

        const themePeers: ThemePeerGroup[] = themeInfos.map((t) => {
            const tdKey = `${t.themeId}|${entry.tradeDate}`;
            const codes = themePeerCodes.get(tdKey) ?? [];
            const peers: StockMetrics[] = [];
            for (const code of codes) {
                if (code === entry.stockCode) continue; // 자기 자신 제외
                const row = peerFeatureMap.get(makeKey(code, entry.tradeDate, entry.tradeTime));
                peers.push(buildMetrics(code, stockNameMap, row));
            }
            // 정렬: 누적 거래대금 큰 순 → 상위 노출 우선
            peers.sort((a, b) => {
                const av = a.cumulativeAmount ?? 0n;
                const bv = b.cumulativeAmount ?? 0n;
                if (av === bv) return 0;
                return av > bv ? -1 : 1;
            });
            return {
                themeId: t.themeId,
                themeName: t.themeName,
                peers,
            };
        });

        return { entry, self, themePeers };
    });
}

/* ===========================================================
 * 1) feature 조회 (self + peer 공용)
 * =========================================================== */

interface FeatureKey {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
}

async function fetchFeatures(
    db: Database,
    keys: readonly FeatureKey[]
): Promise<Map<string, Record<string, any>>> {
    if (keys.length === 0) return new Map();

    // dedupe (peer 호출 시 중복이 많이 발생)
    const seen = new Set<string>();
    const uniq: FeatureKey[] = [];
    for (const k of keys) {
        const id = makeKey(k.stockCode, k.tradeDate, k.tradeTime);
        if (!seen.has(id)) {
            seen.add(id);
            uniq.push(k);
        }
    }

    const tuples = uniq.map(
        (k) => sql`(${k.stockCode}, ${k.tradeDate}::date, ${k.tradeTime}::time)`
    );

    const result = await db.execute(sql`
    SELECT
      stock_code,
      trade_date,
      trade_time,
      close_rate_nxt,
      cumulative_trading_amount,
      day_high_rate,
      pullback_from_day_high,
      cnt_100_amt
    FROM minute_candle_features
    WHERE (stock_code, trade_date, trade_time) IN (${sql.join(tuples, sql`, `)})
  `);

    const rows = (result as unknown as { rows: Array<Record<string, any>> }).rows;

    const map = new Map<string, Record<string, any>>();
    for (const r of rows) {
        const key = makeKey(
            String(r.stock_code),
            formatDate(r.trade_date),
            formatTime(r.trade_time)
        );
        map.set(key, r);
    }
    return map;
}

/* ===========================================================
 * 2) entry 종목들의 그날 속한 테마
 * =========================================================== */

interface ThemeInfo {
    themeId: string;
    themeName: string;
}

async function fetchThemesForEntries(
    db: Database,
    entries: readonly DeckEntry[]
): Promise<Map<string, ThemeInfo[]>> {
    const pairs = uniqueStockDatePairs(entries);
    if (pairs.length === 0) return new Map();

    const tuples = pairs.map(
        ([code, date]) => sql`(${code}, ${date}::date)`
    );

    const result = await db.execute(sql`
    SELECT
      dc.stock_code,
      dc.trade_date,
      t.theme_id,
      t.theme_name
    FROM daily_candles dc
    JOIN daily_theme_mappings dtm ON dtm.daily_candle_id = dc.id
    JOIN themes t ON t.theme_id = dtm.theme_id
    WHERE (dc.stock_code, dc.trade_date) IN (${sql.join(tuples, sql`, `)})
  `);

    const rows = (result as unknown as {
        rows: Array<{
            stock_code: string;
            trade_date: any;
            theme_id: string | number | bigint;
            theme_name: string;
        }>;
    }).rows;

    const map = new Map<string, ThemeInfo[]>();
    for (const r of rows) {
        const key = `${r.stock_code}|${formatDate(r.trade_date)}`;
        const arr = map.get(key) ?? [];
        arr.push({
            themeId: String(r.theme_id),
            themeName: r.theme_name,
        });
        map.set(key, arr);
    }
    return map;
}

/* ===========================================================
 * 3) (themeId, tradeDate) → peer stockCode 들
 * =========================================================== */

async function fetchPeerStockCodes(
    db: Database,
    stockDateThemes: Map<string, ThemeInfo[]>
): Promise<Map<string, string[]>> {
    // (themeId, tradeDate) 고유 쌍 추출
    const themeDatePairs = new Set<string>();
    for (const [sdKey, infos] of stockDateThemes.entries()) {
        const [, tradeDate] = sdKey.split("|");
        for (const t of infos) {
            themeDatePairs.add(`${t.themeId}|${tradeDate}`);
        }
    }
    if (themeDatePairs.size === 0) return new Map();

    const tuples = Array.from(themeDatePairs).map((p) => {
        const [themeId, tradeDate] = p.split("|");
        return sql`(${themeId}::bigint, ${tradeDate}::date)`;
    });

    const result = await db.execute(sql`
    SELECT
      dtm.theme_id,
      dc.trade_date,
      dc.stock_code
    FROM daily_theme_mappings dtm
    JOIN daily_candles dc ON dc.id = dtm.daily_candle_id
    WHERE (dtm.theme_id, dc.trade_date) IN (${sql.join(tuples, sql`, `)})
  `);

    const rows = (result as unknown as {
        rows: Array<{
            theme_id: string | number | bigint;
            trade_date: any;
            stock_code: string;
        }>;
    }).rows;

    const map = new Map<string, string[]>();
    for (const r of rows) {
        const key = `${String(r.theme_id)}|${formatDate(r.trade_date)}`;
        const arr = map.get(key) ?? [];
        arr.push(r.stock_code);
        map.set(key, arr);
    }
    return map;
}

/* ===========================================================
 * 4) peer feature 조회용 키 빌드
 * =========================================================== */

function buildPeerFeatureEntries(
    entries: readonly DeckEntry[],
    stockDateThemes: Map<string, ThemeInfo[]>,
    themePeerCodes: Map<string, string[]>
): FeatureKey[] {
    const out: FeatureKey[] = [];
    const seen = new Set<string>();

    for (const e of entries) {
        const sdKey = `${e.stockCode}|${e.tradeDate}`;
        const themeInfos = stockDateThemes.get(sdKey) ?? [];

        for (const t of themeInfos) {
            const tdKey = `${t.themeId}|${e.tradeDate}`;
            const codes = themePeerCodes.get(tdKey) ?? [];

            for (const code of codes) {
                if (code === e.stockCode) continue;
                const id = makeKey(code, e.tradeDate, e.tradeTime);
                if (!seen.has(id)) {
                    seen.add(id);
                    out.push({
                        stockCode: code,
                        tradeDate: e.tradeDate,
                        tradeTime: e.tradeTime,
                    });
                }
            }
        }
    }

    return out;
}

/* ===========================================================
 * 5) 종목명
 * =========================================================== */

async function fetchStockNames(
    db: Database,
    stockCodes: string[]
): Promise<Map<string, string>> {
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select({
            stockCode: stocks.stockCode,
            stockName: stocks.stockName,
        })
        .from(stocks)
        .where(inArray(stocks.stockCode, stockCodes));

    const map = new Map<string, string>();
    for (const r of rows) map.set(r.stockCode, r.stockName);
    return map;
}

/* ===========================================================
 * 변환 헬퍼
 * =========================================================== */

function buildMetrics(
    stockCode: string,
    nameMap: Map<string, string>,
    row: Record<string, any> | undefined
): StockMetrics {
    return {
        stockCode,
        stockName: nameMap.get(stockCode) ?? stockCode,
        closeRate: row ? toNum(row.close_rate_nxt) : null,
        cumulativeAmount: row ? toBigInt(row.cumulative_trading_amount) : null,
        dayHighRate: row ? toNum(row.day_high_rate) : null,
        pullbackFromHigh: row ? toNum(row.pullback_from_day_high) : null,
        cnt100Amt: row ? toInt(row.cnt_100_amt) : null,
    };
}

function makeKey(stockCode: string, tradeDate: string, tradeTime: string): string {
    return `${stockCode}|${tradeDate}|${tradeTime}`;
}

function uniqueStockDatePairs(
    entries: readonly DeckEntry[]
): Array<[string, string]> {
    const seen = new Set<string>();
    const out: Array<[string, string]> = [];
    for (const e of entries) {
        const k = `${e.stockCode}|${e.tradeDate}`;
        if (!seen.has(k)) {
            seen.add(k);
            out.push([e.stockCode, e.tradeDate]);
        }
    }
    return out;
}

function toNum(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
    const n = toNum(v);
    return n === null ? null : Math.trunc(n);
}

function toBigInt(v: unknown): bigint | null {
    if (v === null || v === undefined || v === "") return null;
    try {
        if (typeof v === "bigint") return v;
        if (typeof v === "number") return BigInt(Math.trunc(v));
        const s = String(v).split(".")[0];
        return BigInt(s);
    } catch {
        return null;
    }
}

function formatDate(v: unknown): string {
    if (typeof v === "string") return v.slice(0, 10);
    if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    return String(v);
}

function formatTime(v: unknown): string {
    if (typeof v === "string") return v.length >= 8 ? v.slice(0, 8) : v;
    if (v instanceof Date) {
        const hh = String(v.getHours()).padStart(2, "0");
        const mm = String(v.getMinutes()).padStart(2, "0");
        const ss = String(v.getSeconds()).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }
    return String(v);
}
