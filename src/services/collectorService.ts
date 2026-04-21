import fs from "fs";
import path from "path";
import { logger } from "@/utils/logger";
import { kiwoomClient } from "@/clients/kiwoomClient";
import {
    normalizeDailyCandle,
    normalizeMinuteCandle,
    normalizeStockInfo,
} from "@/services/normalizer";
import {
    saveStock,
    saveDailyCandles,
    saveMinuteCandles,
    saveTheme,
    saveThemeMapping,
    findStock,
    findDailyCandle,
} from "@/db/marketRepository";
import type { KiwoomKa10081Response, KiwoomKa10080Response } from "@/clients/kiwoomClient";

type RawDailyCandle = KiwoomKa10081Response["stk_dt_pole_chart_qry"][number];
type RawMinuteCandle = KiwoomKa10080Response["stk_min_pole_chart_qry"][number];

// ============================================================
// API Fetch Helpers (내부 전용)
// ============================================================

/**
 * 일봉 데이터를 API로 조회합니다.
 * contYn === "Y"인 경우, 1회 추가 조회하여 두 페이지 분량을 합쳐서 반환합니다.
 */
async function fetchDailyCandles(
    stockCode: string,
    baseDate: string
): Promise<RawDailyCandle[]> {
    const res1 = await kiwoomClient.getDailyChart(stockCode, baseDate);
    const page1 = res1.data.stk_dt_pole_chart_qry ?? [];

    if (res1.contYn === "Y" && res1.nextKey) {
        logger.debug(`[fetchDailyCandles] ${stockCode} 연속조회 실행 (nextKey: ${res1.nextKey})`);
        const res2 = await kiwoomClient.getDailyChart(stockCode, baseDate, "Y", res1.nextKey);
        const page2 = res2.data.stk_dt_pole_chart_qry ?? [];
        return [...page1, ...page2];
    }

    return page1;
}

/**
 * 분봉을 연속 조회합니다.
 * tradeDate(YYYYMMDD) 이전 날짜의 캔들이 감지되면 즉시 중단하고,
 * tradeDate 당일 분봉만 필터링하여 반환합니다.
 */
async function fetchMinuteCandlesForDate(
    stockCode: string,
    apiDate: string
): Promise<RawMinuteCandle[]> {
    const collected: RawMinuteCandle[] = [];
    let contYn = "N";
    let nextKey = "";
    let done = false;

    do {
        const res = await kiwoomClient.getMinuteChart(stockCode, apiDate, contYn, nextKey);
        const candles = res.data.stk_min_pole_chart_qry ?? [];

        for (const candle of candles) {
            const candleDate = candle.cntr_tm.slice(0, 8);
            if (candleDate === apiDate) {
                collected.push(candle);
            } else if (candleDate < apiDate) {
                done = true;
                break;
            }
        }

        if (!done && res.contYn === "Y" && res.nextKey) {
            contYn = res.contYn;
            nextKey = res.nextKey;
            logger.debug(`[fetchMinuteCandlesForDate] ${stockCode} 연속조회 (nextKey: ${nextKey})`);
        } else {
            done = true;
        }
    } while (!done);

    return collected;
}

// ============================================================
// 1. 종목 정보 수집
// ============================================================

export async function collectStock(stockCode: string): Promise<void> {
    logger.info(`[Collector] ${stockCode} 종목 정보 수집 중...`);

    const [infoRes, basicRes] = await Promise.all([
        kiwoomClient.getStockInfo(stockCode),
        kiwoomClient.getBasicInfo(stockCode),
    ]);

    const data = normalizeStockInfo(infoRes.data, basicRes.data);
    await saveStock(data);

    logger.info(`[Collector] ${stockCode} 종목 정보 저장 완료`);
}

// ============================================================
// 2. 일봉 수집
// ============================================================

/**
 * 특정 종목의 일봉을 KRX + NXT 기준으로 병렬 조회하여 정규화 후 저장합니다.
 *
 * @param stockCode - KRX 종목코드 (예: "005930")
 * @param baseDate  - 기준일 "YYYYMMDD". 비어있으면 최근 데이터.
 */
export async function collectDailyCandles(
    stockCode: string,
    baseDate: string = ""
): Promise<void> {
    logger.info(`[Collector] ${stockCode} 일봉 수집 시작 (baseDate: ${baseDate || "최근"})`);

    const stockCodeNxt = `${stockCode}_AL`;

    // KRX / NXT 병렬 조회 (각 최대 2페이지)
    const [krxCandles, nxtCandles] = await Promise.all([
        fetchDailyCandles(stockCode, baseDate),
        fetchDailyCandles(stockCodeNxt, baseDate),
    ]);

    if (krxCandles.length === 0 || nxtCandles.length === 0) {
        logger.warn(`[Collector] ${stockCode} 일봉 데이터 없음 (KRX: ${krxCandles.length}, NXT: ${nxtCandles.length})`);
        return;
    }

    logger.info(`[Collector] KRX ${krxCandles.length}개, NXT ${nxtCandles.length}개 수신`);

    // 상장일 조회: 가장 오래된 캔들이 상장일인지 판별
    const stockInfo = await findStock(stockCode);
    const regDayFormatted = stockInfo?.regDay?.replace(/-/g, "") ?? null;

    const count = Math.min(krxCandles.length, nxtCandles.length);
    const rows = [];

    // 마지막 캔들(가장 오래된)이 상장 첫날이면 prevClose=null로 포함, 아니면 제외
    const oldestKrx = krxCandles[count - 1];
    if (regDayFormatted && oldestKrx.dt === regDayFormatted) {
        logger.info(`[Collector] ${stockCode} 상장 첫날(${oldestKrx.dt}) 캔들 포함`);
        rows.push(normalizeDailyCandle(
            krxCandles[count - 1],
            nxtCandles[count - 1],
            stockCode,
            null,
            null
        ));
    }

    // 나머지 캔들 (최신 → 과거, 마지막 제외): prevClose = i+1 종가
    for (let i = 0; i < count - 1; i++) {
        rows.push(normalizeDailyCandle(
            krxCandles[i],
            nxtCandles[i],
            stockCode,
            krxCandles[i + 1].cur_prc,
            nxtCandles[i + 1].cur_prc
        ));
    }

    if (rows.length === 0) {
        logger.warn(`[Collector] ${stockCode} 저장할 캔들 없음 (최소 2개 필요)`);
        return;
    }

    await saveDailyCandles(rows);
    logger.info(`[Collector] ${stockCode} ${rows.length}개 일봉 저장 완료`);
}

// ============================================================
// 3. 분봉 수집
// ============================================================

/**
 * 특정 종목의 특정 거래일 분봉을 수집하여 정규화 후 저장합니다.
 *
 * @param stockCode - 종목코드
 * @param tradeDate - 거래일 (예: "2024-10-21", DB date 형식)
 */
export async function collectMinuteCandles(
    stockCode: string,
    tradeDate: string
): Promise<void> {
    logger.info(`[Collector] ${stockCode} ${tradeDate} 분봉 수집 시작`);

    // DB에서 해당 일봉 조회 (FK + prevClose 확보)
    const dailyRow = await findDailyCandle(stockCode, tradeDate);
    if (!dailyRow) {
        logger.warn(`[Collector] ${stockCode} ${tradeDate} 일봉 없음. 분봉 저장 건너뜀.`);
        return;
    }

    const apiDate = tradeDate.replace(/-/g, "");
    const rawMinutes = await fetchMinuteCandlesForDate(stockCode, apiDate);

    if (rawMinutes.length === 0) {
        logger.warn(`[Collector] ${stockCode} ${tradeDate} 분봉 데이터 없음`);
        return;
    }

    logger.info(`[Collector] ${rawMinutes.length}개 분봉 수집 완료`);

    const rows = rawMinutes.map((candle) =>
        normalizeMinuteCandle(candle, dailyRow.id, dailyRow.prevCloseKrx, dailyRow.prevCloseNxt)
    );

    await saveMinuteCandles(rows);
    logger.info(`[Collector] ${stockCode} ${tradeDate} ${rows.length}개 분봉 저장 완료`);
}

// ============================================================
// 4. 테마 매핑 수집
// ============================================================

export async function collectThemeMapping(
    stockCode: string,
    tradeDate: string,
    themeName: string
): Promise<void> {
    const dailyRow = await findDailyCandle(stockCode, tradeDate);
    if (!dailyRow) return;

    const themeId = await saveTheme(themeName);
    await saveThemeMapping(themeId, dailyRow.id);
}

// ============================================================
// CollectorService: CSV 파일 기반 배치 실행 진입점
// ============================================================

interface GroupedTarget {
    stockName: string;
    themes: Set<string>;
}

export class CollectorService {

    /**
     * CSV 파일을 읽어 배치를 실행합니다.
     * 파일명(YYYY-MM-DD.csv)에서 날짜를 자동으로 추출합니다.
     */
    async collectFromFile(filePath: string): Promise<void> {
        const fileName = path.basename(filePath, ".csv");
        const tradeDate = fileName; // "2026-04-20" 형식 기대

        if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) {
            logger.error(`[Collector] 파일명이 날짜 형식이 아닙니다: ${fileName}`);
            return;
        }

        try {
            const groupedData = this.parseAndGroupCsv(filePath);
            logger.info(`[Collector] === ${tradeDate} 수집 시작 (고유 종목: ${groupedData.size}건) ===`);

            for (const [stockCode, info] of groupedData.entries()) {
                try {
                    logger.info(`[Collector] [${stockCode}] ${info.stockName} 처리 중...`);

                    const apiDate = tradeDate.replace(/-/g, "");

                    await collectStock(stockCode);
                    await collectDailyCandles(stockCode, apiDate);
                    await collectMinuteCandles(stockCode, tradeDate);

                    for (const theme of info.themes) {
                        await collectThemeMapping(stockCode, tradeDate, theme);
                    }

                } catch (err) {
                    logger.error(`[Collector] ${stockCode} 수집 중 에러 발생 (건너뜀):`, err);
                }
            }

            logger.info(`[Collector] === ${tradeDate} 배치 완료 ===`);
        } catch (error) {
            logger.error("[Collector] 파일 처리 중 치명적 오류:", error);
        }
    }

    /**
     * CSV 파싱 로직: 접두어(') 제거 및 불필요한 행(BLANK|) 필터링
     */
    private parseAndGroupCsv(filePath: string): Map<string, GroupedTarget> {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split(/\r?\n/);
        const stockMap = new Map<string, GroupedTarget>();

        // 헤더 제외 (메모,종목코드,종목명)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line || line.includes("BLANK|")) continue;

            const columns = line.split(",").map(col => col.trim().replace(/^'/, ""));

            if (columns.length < 3) continue;

            const [themeRaw, code, name] = columns;

            if (!code || !name) continue;

            if (!stockMap.has(code)) {
                stockMap.set(code, { stockName: name, themes: new Set() });
            }

            if (themeRaw) {
                stockMap.get(code)!.themes.add(themeRaw);
            }
        }

        return stockMap;
    }
}

export const collectorService = new CollectorService();