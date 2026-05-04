import { and, eq, inArray, sql } from "drizzle-orm";
import {
    minuteCandles,
    dailyCandles,
    dailyThemeMappings,
    themes,
} from "@trade-data-manager/market-data";
import { minuteCandleFeatures } from "../market-feature/schema";
import type { Database } from "../index";
import type {
    DeckEntry,
    AnalyzedEntry,
    ThemePeerGroup,
} from "./types";

/**
 * deck entries를 받아 각 시점의 분봉 피처와
 * 같은 (themeId, tradeDate)의 동반 종목 분봉 피처를 조회.
 */
export async function analyzeEntries(
    db: Database,
    entries: readonly DeckEntry[]
): Promise<AnalyzedEntry[]> {
    if (entries.length === 0) return [];

    // 1. 시점별 자기 자신 분봉 피처 조회
    const selfMap = await fetchSelfFeatures(db, entries);

    // 2. 각 entry의 daily_candle을 통해 themeId 매핑
    const themeMap = await fetchThemesByStockDate(db, entries);

    // 3. 각 (themeId, tradeDate) 쌍의 모든 종목 dailyCandleId 수집
    const peerStockMap = await fetchThemePeerStocks(db, themeMap);

    // 4. 동반 종목들의 같은 시점 분봉 피처 조회
    const peerFeatureMap = await fetchPeerFeatures(db, entries, peerStockMap);

    // 5. 결과 조립
    return entries.map((entry) => {
        const selfKey = makeKey(entry.stockCode, entry.tradeDate, entry.tradeTime);
        const selfFeature = selfMap.get(selfKey) ?? null;

        const stockDateKey = `${entry.stockCode}|${entry.tradeDate}`;
        const entryThemes = themeMap.get(stockDateKey) ?? [];

        const themePeers: ThemePeerGroup[] = entryThemes.map((t) => {
            const peerKey = `${t.themeId}|${entry.tradeDate}|${entry.tradeTime}`;
            const allPeers = peerFeatureMap.get(peerKey) ?? [];
            // 자기 자신 제외
            const peers = allPeers.filter(
                (p: any) => p.stockCode !== entry.stockCode
            );
            return {
                themeId: t.themeId,
                themeName: t.themeName,
                peers,
            };
        });

        return { entry, selfFeature, themePeers };
    });
}

/* ===========================================================
 * 내부 헬퍼
 * =========================================================== */

function makeKey(stockCode: string, tradeDate: string, tradeTime: string): string {
    return `${stockCode}|${tradeDate}|${tradeTime}`;
}

/**
 * (stockCode, tradeDate, tradeTime) IN-list 조회로 자기 분봉 피처 가져오기.
 */
async function fetchSelfFeatures(
    db: Database,
    entries: readonly DeckEntry[]
): Promise<Map<string, Record<string, any>>> {
    // PostgreSQL의 (a,b,c) IN ((...),(...)) 문법 활용
    const tuples = entries.map(
        (e) =>
            sql`(${e.stockCode}, ${e.tradeDate}::date, ${e.tradeTime}::time)`
    );

    const rows = (await db.execute(sql`
        SELECT *
        FROM minute_candle_features
        WHERE (stock_code, trade_date, trade_time) IN (${sql.join(tuples, sql`, `)})
    `)) as unknown as { rows: Record<string, any>[] };

    const map = new Map<string, Record<string, any>>();
    for (const r of rows.rows) {
        const key = makeKey(r.stock_code, formatDate(r.trade_date), r.trade_time);
        map.set(key, r);
    }
    return map;
}

/**
 * 각 (stockCode, tradeDate)에 매핑된 테마 정보 조회.
 */
async function fetchThemesByStockDate(
    db: Database,
    entries: readonly DeckEntry[]
): Promise<Map<string, Array<{ themeId: bigint; themeName: string }>>> {
    const stockDatePairs = uniqueStockDatePairs(entries);
    if (stockDatePairs.length === 0) return new Map();

    const tuples = stockDatePairs.map(
        ([stockCode, tradeDate]) =>
            sql`(${stockCode}, ${tradeDate}::date)`
    );

    const rows = (await db.execute(sql`
        SELECT 
            dc.stock_code,
            dc.trade_date,
            t.theme_id,
            t.theme_name
        FROM daily_candles dc
        JOIN daily_theme_mappings dtm ON dtm.daily_candle_id = dc.id
        JOIN themes t ON t.theme_id = dtm.theme_id
        WHERE (dc.stock_code, dc.trade_date) IN (${sql.join(tuples, sql`, `)})
    `)) as unknown as {
        rows: Array<{
            stock_code: string;
            trade_date: string;
            theme_id: string;
            theme_name: string;
        }>;
    };

    const map = new Map<string, Array<{ themeId: bigint; themeName: string }>>();
    for (const r of rows.rows) {
        const key = `${r.stock_code}|${formatDate(r.trade_date)}`;
        const arr = map.get(key) ?? [];
        arr.push({ themeId: BigInt(r.theme_id), themeName: r.theme_name });
        map.set(key, arr);
    }
    return map;
}

/**
 * (themeId, tradeDate)별로 그 테마에 속한 모든 종목코드 수집.
 */
async function fetchThemePeerStocks(
    db: Database,
    themeMap: Map<string, Array<{ themeId: bigint; themeName: string }>>
): Promise<Map<string, string[]>> {
    // (themeId, tradeDate) 고유 쌍 추출
    const pairs = new Set<string>();
    for (const [stockDateKey, themes] of themeMap.entries()) {
        const [, tradeDate] = stockDateKey.split("|");
        for (const t of themes) {
            pairs.add(`${t.themeId}|${tradeDate}`);
        }
    }
    if (pairs.size === 0) return new Map();

    const tuples = Array.from(pairs).map((p) => {
        const [themeId, tradeDate] = p.split("|");
        return sql`(${themeId}::bigint, ${tradeDate}::date)`;
    });

    const rows = (await db.execute(sql`
        SELECT 
            dtm.theme_id,
            dc.trade_date,
            dc.stock_code
        FROM daily_theme_mappings dtm
        JOIN daily_candles dc ON dc.id = dtm.daily_candle_id
        WHERE (dtm.theme_id, dc.trade_date) IN (${sql.join(tuples, sql`, `)})
    `)) as unknown as {
        rows: Array<{
            theme_id: string;
            trade_date: string;
            stock_code: string;
        }>;
    };

    const map = new Map<string, string[]>();
    for (const r of rows.rows) {
        const key = `${r.theme_id}|${formatDate(r.trade_date)}`;
        const arr = map.get(key) ?? [];
        arr.push(r.stock_code);
        map.set(key, arr);
    }
    return map;
}

/**
 * 각 (themeId, tradeDate, tradeTime) 시점의 모든 종목 분봉 피처 조회.
 */
async function fetchPeerFeatures(
    db: Database,
    entries: readonly DeckEntry[],
    peerStockMap: Map<string, string[]>
): Promise<Map<string, Record<string, any>[]>> {
    // (stockCodes[], tradeDate, tradeTime) 그룹별로 묶어서 조회
    // peerKey: themeId|tradeDate|tradeTime
    const result = new Map<string, Record<string, any>[]>();

    // 같은 (tradeDate, tradeTime) 시점에서 모든 종목코드를 합쳐 한 번에 조회
    type TimeGroup = {
        tradeDate: string;
        tradeTime: string;
        stockCodes: Set<string>;
    };
    const timeGroups = new Map<string, TimeGroup>();

    for (const e of entries) {
        const tKey = `${e.tradeDate}|${e.tradeTime}`;
        if (!timeGroups.has(tKey)) {
            timeGroups.set(tKey, {
                tradeDate: e.tradeDate,
                tradeTime: e.tradeTime,
                stockCodes: new Set(),
            });
        }
        const group = timeGroups.get(tKey)!;
        // peerStockMap에서 해당 entry의 모든 테마 동반 종목 코드 수집
        // (entry 자신을 위한 themeMap 조회는 analyzeEntries에서 별도)
        // 여기선 모든 가능한 peer stockCode를 group에 추가
        for (const stocks of peerStockMap.values()) {
            for (const s of stocks) group.stockCodes.add(s);
        }
    }

    for (const group of timeGroups.values()) {
        if (group.stockCodes.size === 0) continue;

        const codes = Array.from(group.stockCodes);
        const rows = await db
            .select()
            .from(minuteCandleFeatures)
            .where(
                and(
                    eq((minuteCandleFeatures as any).tradeDate, group.tradeDate),
                    eq((minuteCandleFeatures as any).tradeTime, group.tradeTime),
                    inArray((minuteCandleFeatures as any).stockCode, codes)
                )
            );

        // peerKey별로 분배: 각 row를 themeId 기준으로 매핑
        for (const row of rows as any[]) {
            // 이 row가 어느 theme들에 속하는지는 peerStockMap을 역으로 조회
            for (const [peerKey, stocks] of peerStockMap.entries()) {
                const [, peerDate] = peerKey.split("|");
                if (peerDate !== group.tradeDate) continue;
                if (!stocks.includes(row.stockCode)) continue;
                const fullKey = `${peerKey}|${group.tradeTime}`;
                const arr = result.get(fullKey) ?? [];
                arr.push(row);
                result.set(fullKey, arr);
            }
        }
    }

    return result;
}

function uniqueStockDatePairs(
    entries: readonly DeckEntry[]
): Array<[string, string]> {
    const set = new Set<string>();
    const result: Array<[string, string]> = [];
    for (const e of entries) {
        const key = `${e.stockCode}|${e.tradeDate}`;
        if (!set.has(key)) {
            set.add(key);
            result.push([e.stockCode, e.tradeDate]);
        }
    }
    return result;
}

/**
 * pg가 date 컬럼을 Date 객체로 줄 수도 있어서 'YYYY-MM-DD'로 정규화.
 */
function formatDate(v: any): string {
    if (typeof v === "string") return v.slice(0, 10);
    if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    return String(v);
}
