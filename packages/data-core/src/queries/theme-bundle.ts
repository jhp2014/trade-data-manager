import { and, eq, asc, lte, desc, inArray } from "drizzle-orm";
import {
    stocks,
    dailyCandles,
    minuteCandles,
    type DailyCandle,
    type MinuteCandle,
} from "../schema/market";
import { minuteCandleFeatures } from "../schema/features";
import type { Database } from "../db";
import {
    findThemesByStockAndDate,
    findMemberCodesByThemeIds,
} from "../repositories/theme.repository";

/* ===========================================================
 * Theme Bundle — 단건 종목/거래일에 대한 테마 단위 시계열 묶음
 *
 * 한 종목이 여러 테마에 속하면 테마별로 element 가 N 개 나옵니다.
 * 테마 매핑이 없으면 self 만 포함된 가짜 테마 (themeId="", themeName="(테마 없음)") 1 개를 반환합니다.
 *
 * raw row 만 반환합니다. padding/시간 정규화/MAX_SERIES 자르기 등은
 * 호출부(앱) 책임입니다.
 * =========================================================== */

const DAILY_LOOKBACK = 240; // 약 1년치 거래일

export type DailyCandleRow = DailyCandle;
export type MinuteCandleRow = MinuteCandle;
export type MinuteFeatureRow = Record<string, any>;

export interface ThemeBundleMember {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
    daily: DailyCandleRow[];      // 240 거래일치 (tradeDate ASC)
    minute: MinuteCandleRow[];     // 당일 분봉 (tradeTime ASC)
    features: MinuteFeatureRow[];  // 당일 분봉 피처 (tradeTime ASC)
}

export interface ThemeBundle {
    themeId: string;       // bigint -> string. 테마 매핑 없을 때는 ""
    themeName: string;     // 테마 매핑 없을 때는 "(테마 없음)"
    members: ThemeBundleMember[];  // self 항상 포함
}

export async function getThemeBundle(
    db: Database,
    params: { stockCode: string; tradeDate: string }
): Promise<ThemeBundle[]> {
    const { stockCode, tradeDate } = params;

    // 1) self 가 그날 속한 테마 목록 (없으면 가짜 테마 1 개)
    const themes = await findThemesByStockAndDate(db, { stockCode, tradeDate });

    // 2) 테마별 멤버 코드 (self 포함)
    const themeIds = themes.map((t) => t.themeId);
    const themeToCodes = await findMemberCodesByThemeIds(db, { themeIds, tradeDate, selfCode: stockCode });

    // 3) 모든 코드 합집합으로 시계열을 한 번에 조회
    const allCodes = collectAllCodes(themeToCodes, stockCode);

    const [nameMap, dailyByCode, minuteByCode, featuresByCode] = await Promise.all([
        fetchStockNames(db, allCodes),
        fetchDailyByCodes(db, allCodes, tradeDate),
        fetchMinuteByCodes(db, allCodes, tradeDate),
        fetchFeaturesByCodes(db, allCodes, tradeDate),
    ]);

    return themes.map(({ themeId, themeName }) => {
        const codes = themeToCodes.get(themeId) ?? [stockCode];
        // self 가 첫 번째 멤버
        const ordered = [stockCode, ...codes.filter((c) => c !== stockCode)];
        const members: ThemeBundleMember[] = ordered.map((code) => ({
            stockCode: code,
            stockName: nameMap.get(code) ?? code,
            isSelf: code === stockCode,
            daily: dailyByCode.get(code) ?? [],
            minute: minuteByCode.get(code) ?? [],
            features: featuresByCode.get(code) ?? [],
        }));
        return { themeId, themeName, members };
    });
}

function collectAllCodes(
    themeToCodes: Map<string, string[]>,
    stockCode: string,
): string[] {
    const set = new Set<string>([stockCode]);
    for (const codes of themeToCodes.values()) {
        for (const c of codes) set.add(c);
    }
    return Array.from(set);
}

/* ===========================================================
 * 3) 종목명
 * =========================================================== */

async function fetchStockNames(
    db: Database,
    stockCodes: string[],
): Promise<Map<string, string>> {
    if (stockCodes.length === 0) return new Map();
    const rows = await db
        .select({ stockCode: stocks.stockCode, stockName: stocks.stockName })
        .from(stocks)
        .where(inArray(stocks.stockCode, stockCodes));
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.stockCode, r.stockName);
    return map;
}

/* ===========================================================
 * 4) 일봉 — 종목별 240 거래일치
 *    종목 수가 많지 않아 (보통 <= 15) 종목별 병렬 쿼리로 단순화.
 * =========================================================== */

async function fetchDailyByCodes(
    db: Database,
    stockCodes: string[],
    tradeDate: string,
): Promise<Map<string, DailyCandleRow[]>> {
    if (stockCodes.length === 0) return new Map();

    const lists = await Promise.all(
        stockCodes.map(async (code) => {
            const rows = await db
                .select()
                .from(dailyCandles)
                .where(
                    and(
                        eq(dailyCandles.stockCode, code),
                        lte(dailyCandles.tradeDate, tradeDate),
                    ),
                )
                .orderBy(desc(dailyCandles.tradeDate))
                .limit(DAILY_LOOKBACK);
            // 차트는 시간 ASC
            return [code, rows.slice().reverse()] as const;
        }),
    );

    const map = new Map<string, DailyCandleRow[]>();
    for (const [code, list] of lists) map.set(code, list);
    return map;
}

/* ===========================================================
 * 5) 분봉 — 종목별 당일 전체 (시간 ASC)
 * =========================================================== */

async function fetchMinuteByCodes(
    db: Database,
    stockCodes: string[],
    tradeDate: string,
): Promise<Map<string, MinuteCandleRow[]>> {
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select()
        .from(minuteCandles)
        .where(
            and(
                inArray(minuteCandles.stockCode, stockCodes),
                eq(minuteCandles.tradeDate, tradeDate),
            ),
        )
        .orderBy(asc(minuteCandles.stockCode), asc(minuteCandles.tradeTime));

    const map = new Map<string, MinuteCandleRow[]>();
    for (const r of rows) {
        const arr = map.get(r.stockCode) ?? [];
        arr.push(r);
        map.set(r.stockCode, arr);
    }
    return map;
}

/* ===========================================================
 * 6) 분봉 피처 — 종목별 당일 전체 (시간 ASC)
 * =========================================================== */

async function fetchFeaturesByCodes(
    db: Database,
    stockCodes: string[],
    tradeDate: string,
): Promise<Map<string, MinuteFeatureRow[]>> {
    if (stockCodes.length === 0) return new Map();

    const rows = await db
        .select()
        .from(minuteCandleFeatures)
        .where(
            and(
                inArray((minuteCandleFeatures as any).stockCode, stockCodes),
                eq((minuteCandleFeatures as any).tradeDate, tradeDate),
            ),
        )
        .orderBy(
            asc((minuteCandleFeatures as any).stockCode),
            asc((minuteCandleFeatures as any).tradeTime),
        );

    const map = new Map<string, MinuteFeatureRow[]>();
    for (const r of rows as Array<Record<string, any>>) {
        const code = r.stockCode as string;
        const arr = map.get(code) ?? [];
        arr.push(r);
        map.set(code, arr);
    }
    return map;
}
