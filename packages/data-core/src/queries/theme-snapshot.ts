import { findThemesByStockAndDate, findMemberCodesByThemeIds } from "../repositories/theme.repository";
import { findStocksMapByCodes } from "../repositories/stock.repository";
import { findFeaturesAt } from "../repositories/market-feature.repository";
import type { Database } from "../db";
import type { MinuteCandleFeatures } from "../schema/features";

/* ===========================================================
 * Theme Snapshot: 단일 시점 (date, time) 의 테마 묶음
 *
 * deck 시각화용. self + 같은 테마 멤버 종목들의 그 시점 feature row.
 * 한 종목은 여러 테마에 속할 수 있어 element 가 N개일 수 있음.
 * 비어있다면 throw (invariant 위반).
 *
 * 분봉 거래대금은 feature.tradingAmount 로 충분하므로 별도 필드를 두지 않음.
 * =========================================================== */

interface ThemeMemberBase {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
}

export interface ThemeSnapshotMember extends ThemeMemberBase {
    feature: MinuteCandleFeatures | null;
}

export interface ThemeSnapshot {
    themeId: string;
    themeName: string;
    members: ThemeSnapshotMember[];
}

export async function getThemeSnapshotAt(
    db: Database,
    params: { stockCode: string; tradeDate: string; tradeTime: string },
): Promise<ThemeSnapshot[]> {
    const { stockCode, tradeDate, tradeTime } = params;

    const themes = await findThemesByStockAndDate(db, { stockCode, tradeDate });
    if (themes.length === 0) {
        throw new Error(
            `[getThemeSnapshotAt] No theme mapping for stockCode=${stockCode}, tradeDate=${tradeDate}.`
        );
    }

    const themeIds = themes.map((t) => String(t.themeId));
    const themeToCodes = await findMemberCodesByThemeIds(db, {
        themeIds,
        tradeDate,
        selfCode: stockCode,
    });

    const allCodes = collectAllCodes(themeToCodes, stockCode);

    const [stockMap, featureMap] = await Promise.all([
        findStocksMapByCodes(db, { stockCodes: allCodes }),
        findFeaturesAt(db, { stockCodes: allCodes, tradeDate, tradeTime }),
    ]);

    return themes.map((t) => {
        const themeId = String(t.themeId);
        const codes = themeToCodes.get(themeId) ?? [stockCode];
        const ordered = [stockCode, ...codes.filter((c) => c !== stockCode)];
        const members: ThemeSnapshotMember[] = ordered.map((code) => ({
            stockCode: code,
            stockName: stockMap.get(code)?.stockName ?? code,
            isSelf: code === stockCode,
            feature: featureMap.get(code) ?? null,
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
