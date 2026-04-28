'use server';

import {
    getMinutesByCandleIds,
    getHistoricalDailyByCodes,
    getDailyStockInfoListByDate
} from '@/lib/marketRepository';
import { FilledCandle } from '@/type/charts';
import { schema } from '@trade-data-manager/database';
import _ from 'lodash';

/**
 * 헬퍼 1: 기준일의 특정 시간(HH:mm:ss)을 Unix Timestamp로 변환
 */
function toUnixTimestamp(dateStr: string, timeStr: string): number {
    const formattedDate = dateStr.length === 8
        ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
        : dateStr;

    const formattedTime = timeStr.length === 6
        ? `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`
        : timeStr;

    const dt = new Date(`${formattedDate}T${formattedTime}+09:00`);

    return Math.floor(dt.getTime() / 1000);
}


/**
 * 헬퍼 2: 07:50 ~ 20:10 사이의 비어있는 분봉 캔들을 이전 종가로 채움 (NXT 시간 포함 및 앞뒤 10분 패딩)
 */
function fillMissingMinuteCandles(rawMinutes: schema.MinuteCandle[], date: string, prevCloseNxt: number) {
    const startTimeSec = toUnixTimestamp(date, '07:50:00');
    const endTimeSec = toUnixTimestamp(date, '20:10:00');

    // 빠른 매칭을 위해 DB 분봉 데이터를 Map으로 변환 (Key: Unix Timestamp in seconds)
    const minuteMap = new Map<number, FilledCandle>();
    for (const m of rawMinutes) {
        const t = m.unixTimestamp;

        minuteMap.set(t, {
            unixTimestamp: m.unixTimestamp,
            close: Number(m.close),
            open: Number(m.open),
            high: Number(m.high),
            low: Number(m.low),
            closeRateKrx: Number(m.closeRateKrx),
            openRateKrx: Number(m.openRateKrx),
            highRateKrx: Number(m.highRateKrx),
            lowRateKrx: Number(m.lowRateKrx),
            closeRateNxt: Number(m.closeRateNxt),
            openRateNxt: Number(m.openRateNxt),
            highRateNxt: Number(m.highRateNxt),
            lowRateNxt: Number(m.lowRateNxt),
            tradingAmount: Number(m.tradingAmount),
            accumulatedTradingAmount: Number(m.accumulatedTradingAmount)
        });
    }

    const filledCandles: FilledCandle[] = [];
    const UNIT = 100_000_000; // 억 단위
    let lastCloseNxt = prevCloseNxt;
    let lastCloseRateKrx = 0;
    let lastCloseRateNxt = 0;
    let lastAccumulatedTradingAmount = 0;

    for (let t = startTimeSec; t <= endTimeSec; t += 60) {

        const m = minuteMap.get(t);

        if (m) {
            lastCloseNxt = Number(m.close);
            lastCloseRateKrx = Number(m.closeRateKrx);
            lastCloseRateNxt = Number(m.closeRateNxt);
            lastAccumulatedTradingAmount = Number(m.accumulatedTradingAmount);

            filledCandles.push({
                unixTimestamp: t,
                open: m.open, high: m.high, low: m.low, close: m.close,
                openRateKrx: m.openRateKrx, highRateKrx: m.highRateKrx, lowRateKrx: m.lowRateKrx, closeRateKrx: m.closeRateKrx,
                openRateNxt: m.openRateNxt, highRateNxt: m.highRateNxt, lowRateNxt: m.lowRateNxt, closeRateNxt: m.closeRateNxt,
                tradingAmount: Number((m.tradingAmount / UNIT).toFixed(1)),
                accumulatedTradingAmount: Number((m.accumulatedTradingAmount / UNIT).toFixed(1))
            });
        } else {
            // 빈 캔들: 시/고/저/종가를 모두 이전 종가로 유지, 거래대금은 0, 누적은 유지
            filledCandles.push({
                unixTimestamp: t,
                open: lastCloseNxt, high: lastCloseNxt, low: lastCloseNxt, close: lastCloseNxt,
                openRateKrx: lastCloseRateKrx, highRateKrx: lastCloseRateKrx, lowRateKrx: lastCloseRateKrx, closeRateKrx: lastCloseRateKrx,
                openRateNxt: lastCloseRateNxt, highRateNxt: lastCloseRateNxt, lowRateNxt: lastCloseRateNxt, closeRateNxt: lastCloseRateNxt,
                tradingAmount: 0,
                accumulatedTradingAmount: Number((lastAccumulatedTradingAmount / UNIT).toFixed(1))
            });
        }
    }
    return filledCandles;
}

export async function fetchAllChartDataByDateAction(date: string) {

    const dailyStockInfoList = await getDailyStockInfoListByDate(date);
    if (dailyStockInfoList.length === 0) return {};

    const uniqueCandleIds = Array.from(new Set(dailyStockInfoList.map(c => c.dailyCandleId)));
    const uniqueStockCodes = Array.from(new Set(dailyStockInfoList.map(c => c.stockCode)));

    const rawMinutesCandles = await getMinutesByCandleIds(uniqueCandleIds);
    const rawDailyCandles = await getHistoricalDailyByCodes(uniqueStockCodes, date);

    const minutesByDailyCandleId: Record<string, schema.MinuteCandle[]> = _.groupBy(rawMinutesCandles, m => m.dailyCandleId.toString());
    const dailyByStockCode: Record<string, schema.DailyCandle[]> = _.groupBy(rawDailyCandles, d => d.stockCode);

    const themeNamesByStockCode: Record<string, Set<string>> = {};
    for (const { stockCode, themeName } of dailyStockInfoList) {
        (themeNamesByStockCode[stockCode] ??= new Set()).add(themeName);
    }

    const allItems = dailyStockInfoList.map(info => {
        const stockMinutes = minutesByDailyCandleId[info.dailyCandleId.toString()] || [];
        const stockDaily = [...(dailyByStockCode[info.stockCode] || [])].reverse();

        const prevClose = info.prevCloseNxt != null ? Number(info.prevCloseNxt) : 0;

        return {
            stockCode: info.stockCode,
            stockName: info.stockName,
            themeId: info.themeId.toString(),
            themeName: info.themeName,
            allThemeNames: Array.from(themeNamesByStockCode[info.stockCode]),
            dailyInfo: {
                prevCloseKrx: info.prevCloseKrx != null ? Number(info.prevCloseKrx) : null,
                prevCloseNxt: info.prevCloseNxt != null ? Number(info.prevCloseNxt) : null,
                tradingAmountKrx: Number((Number(info.tradingAmountKrx) / 100).toFixed(1)),
                tradingAmountNxt: Number((Number(info.tradingAmountNxt) / 100).toFixed(1)),
                marketCap: info.marketCap != null ? Number(info.marketCap) : null,
            },
            minuteCandles: fillMissingMinuteCandles(stockMinutes, date, prevClose),
            dailyCandles: stockDaily.map(d => ({
                time: d.tradeDate,
                openKrx: Number(d.openKrx), highKrx: Number(d.highKrx), lowKrx: Number(d.lowKrx), closeKrx: Number(d.closeKrx),
                openNxt: Number(d.openNxt), highNxt: Number(d.highNxt), lowNxt: Number(d.lowNxt), closeNxt: Number(d.closeNxt),
                tradingAmountKrx: Number((Number(d.tradingAmountKrx) / 100).toFixed(1)),
                tradingAmountNxt: Number((Number(d.tradingAmountNxt) / 100).toFixed(1)),
            }))
        }
    })
    const result = _.groupBy(allItems, item => item.themeId);

    return result;
}

export type AllThemesChartData = Awaited<ReturnType<typeof fetchAllChartDataByDateAction>>;
export type ThemeChartData = AllThemesChartData[string];
export type StockChartItem = ThemeChartData[number];