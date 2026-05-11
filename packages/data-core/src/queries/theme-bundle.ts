import { findThemesByStockAndDate, findMemberCodesByThemeIds } from "../repositories/theme.repository";
import { findStocksMapByCodes } from "../repositories/stock.repository";
import { findRecentDailyCandlesByCodes } from "../repositories/daily-candle.repository";
import { findMinuteCandlesByCodesAndDate } from "../repositories/minute-candle.repository";
import { findFeaturesByCodesAndDate } from "../repositories/market-feature.repository";
import type { Database } from "../db";
import type { DailyCandle, MinuteCandle } from "../schema/market";
import type { MinuteCandleFeatures } from "../schema/features";

/* ===========================================================
 * Theme Bundle: 차트/시계열 시각화용 묶음 응답
 *
 * 한 종목은 여러 테마에 속할 수 있어 element 가 N개일 수 있음.
 * 테마가 없는 종목(개별주)은 DB 에 placeholder 행이 들어가 있어야 함 (invariant).
 * 비어있다면 throw.
 * =========================================================== */

const DAILY_LOOKBACK = 600;

interface ThemeMemberBase {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
}

export interface ThemeBundleMember extends ThemeMemberBase {
    daily: DailyCandle[];
    minute: MinuteCandle[];
    features: MinuteCandleFeatures[];
}

export interface ThemeBundle {
    themeId: string;
    themeName: string;
    members: ThemeBundleMember[];
}

export async function getThemeBundle(
    db: Database,
    params: { stockCode: string; tradeDate: string },
): Promise<ThemeBundle[]> {
    const { stockCode, tradeDate } = params;

    const themes = await findThemesByStockAndDate(db, { stockCode, tradeDate });
    if (themes.length === 0) {
        throw new Error(
            `[getThemeBundle] No theme mapping for stockCode=${stockCode}, tradeDate=${tradeDate}. ` +
            `Every stock must have at least a placeholder theme row.`
        );
    }

    const themeIds = themes.map((t) => String(t.themeId));
    const themeToCodes = await findMemberCodesByThemeIds(db, {
        themeIds,
        tradeDate,
        selfCode: stockCode,
    });

    const allCodes = collectAllCodes(themeToCodes, stockCode);

    const [stockMap, dailyByCode, minuteByCode, featuresByCode] = await Promise.all([
        findStocksMapByCodes(db, { stockCodes: allCodes }),
        findRecentDailyCandlesByCodes(db, { stockCodes: allCodes, tradeDate, lookback: DAILY_LOOKBACK }),
        findMinuteCandlesByCodesAndDate(db, { stockCodes: allCodes, tradeDate }),
        findFeaturesByCodesAndDate(db, { stockCodes: allCodes, tradeDate }),
    ]);

    return themes.map((t) => {
        const themeId = String(t.themeId);
        const codes = themeToCodes.get(themeId) ?? [stockCode];
        const ordered = [stockCode, ...codes.filter((c) => c !== stockCode)];
        const members: ThemeBundleMember[] = ordered.map((code) => ({
            stockCode: code,
            stockName: stockMap.get(code)?.stockName ?? code,
            isSelf: code === stockCode,
            daily: dailyByCode.get(code) ?? [],
            minute: minuteByCode.get(code) ?? [],
            features: featuresByCode.get(code) ?? [],
        }));
        return { themeId, themeName: t.themeName, members };
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
