import { findThemesByStockAndDate, findMemberCodesByThemeIds } from "../repositories/theme.repository";
import { findStocksMapByCodes } from "../repositories/stock.repository";
import {
    findFeaturesAt,
    findLatestFeaturesBeforeTime,
} from "../repositories/market-feature.repository";
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
 *
 * 요청 시점에 분봉이 없는 멤버(예: VI 발동)는 같은 tradeDate 내 직전 시점의
 * feature 를 carry-forward 한다. 거래대금/분봉 단위 값은 0으로 덮어쓰고
 * 누적·가격·분포는 prev 를 유지한다. carry 된 행에는 isCarriedForward=true.
 * See: docs/decisions/018-carry-forward-vi-feature.md
 * =========================================================== */

/**
 * Snapshot 응답용 feature. DB row 에 carry-forward 여부 플래그를 덧붙인 형태.
 * carry 되지 않은 원본 행에서는 isCarriedForward 가 false 또는 undefined.
 */
export type ThemeSnapshotFeature = MinuteCandleFeatures & {
    isCarriedForward?: boolean;
};

interface ThemeMemberBase {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
}

export interface ThemeSnapshotMember extends ThemeMemberBase {
    feature: ThemeSnapshotFeature | null;
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

    const featureByCode = await fillCarryForwardFeatures({
        db,
        allCodes,
        tradeDate,
        tradeTime,
        featureMap,
    });

    return themes.map((t) => {
        const themeId = String(t.themeId);
        const codes = themeToCodes.get(themeId) ?? [stockCode];
        const ordered = [stockCode, ...codes.filter((c) => c !== stockCode)];
        const members: ThemeSnapshotMember[] = ordered.map((code) => ({
            stockCode: code,
            stockName: stockMap.get(code)?.stockName ?? code,
            isSelf: code === stockCode,
            feature: featureByCode.get(code) ?? null,
        }));
        return { themeId, themeName: t.themeName, members };
    });
}

/**
 * 요청 시점 feature 가 없는 종목에 대해 같은 tradeDate 내 직전 시점 feature 를
 * 가져와 carry feature 로 변환하여 채워준다.
 *
 * carry feature 매핑:
 *  - 가격/누적/분포 컬럼: prev 그대로
 *  - 분봉 단위 거래대금 (tradingAmount): 0
 *  - 식별 메타 (tradeDate, tradeTime): 요청 시점 값
 *  - 모든 changeRateNm: 0 (분봉이 없으므로 변화량 0)
 *  - isCarriedForward: true
 */
async function fillCarryForwardFeatures(args: {
    db: Database;
    allCodes: string[];
    tradeDate: string;
    tradeTime: string;
    featureMap: Map<string, MinuteCandleFeatures>;
}): Promise<Map<string, ThemeSnapshotFeature>> {
    const { db, allCodes, tradeDate, tradeTime, featureMap } = args;

    const out = new Map<string, ThemeSnapshotFeature>();
    const missingCodes: string[] = [];

    for (const code of allCodes) {
        const f = featureMap.get(code);
        if (f) out.set(code, f);
        else missingCodes.push(code);
    }

    if (missingCodes.length === 0) return out;

    const prevMap = await findLatestFeaturesBeforeTime(db, {
        stockCodes: missingCodes,
        tradeDate,
        tradeTime,
    });

    for (const code of missingCodes) {
        const prev = prevMap.get(code);
        if (!prev) continue; // 그날 첫 거래 전 — feature null 유지
        out.set(code, buildCarryFeature(prev, tradeDate, tradeTime));
    }

    return out;
}

function buildCarryFeature(
    prev: MinuteCandleFeatures,
    tradeDate: string,
    tradeTime: string,
): ThemeSnapshotFeature {
    const carry: Record<string, unknown> = { ...(prev as Record<string, unknown>) };

    // 식별 메타: 요청 시점으로 덮어쓰기
    carry.tradeDate = tradeDate;
    carry.tradeTime = tradeTime;

    // 분봉 단위 거래대금: 거래가 없었으므로 0
    carry.tradingAmount = "0";

    // changeRateNm 계열 (변화량): 거래가 없으므로 0
    for (const key of Object.keys(carry)) {
        if (/^changeRate\d+m$/.test(key)) {
            carry[key] = "0.00";
        }
    }

    carry.isCarriedForward = true;
    return carry as ThemeSnapshotFeature;
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
