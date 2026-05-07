"use server";

import { getThemeBundle } from "@trade-data-manager/data-core";
import type {
    ThemeBundle,
    ThemeBundleMember,
    DailyCandleRow,
    MinuteCandleRow,
    MinuteFeatureRow,
} from "@trade-data-manager/data-core";
import { getDataViewDb } from "./db";
import {
    fillMissingMinuteCandles,
    fillMissingOverlayPoints,
} from "@/lib/chartPadding";
import { toNum, dateToUnix, composeUnix } from "@/lib/serialization";
import { CHART_OVERLAY_MAX_SERIES } from "@/lib/constants";
import { type Result, okResult, errResult } from "@/lib/result";

/* ===========================================================
 * 차트 미리보기용 DTO 정의 (data-view 전용)
 * =========================================================== */

export interface ChartCandle {
    time: number; // unix seconds (UTC)
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    amount?: number;
    accAmount?: number;
    prevCloseKrx?: number;
    prevCloseNxt?: number;
}

export interface ChartOverlayPoint {
    time: number;
    value: number;     // closeRateNxt (%)
    amount: number;    // trading_amount (원)
    cumAmount: number; // cumulative_trading_amount (원)
}

export interface ChartLinePoint {
    time: number;
    value: number;
}

export interface ChartOverlaySeries {
    stockCode: string;
    stockName: string;
    isSelf: boolean;
    series: ChartOverlayPoint[];
}

export interface ChartPreviewDTO {
    daily: ChartCandle[];
    minute: ChartCandle[];
    themeOverlay: ChartOverlaySeries[];
    markerTime: number | null;
}

/* ===========================================================
 * fetchChartPreviewAction
 * =========================================================== */

export async function fetchChartPreviewAction(params: {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
}): Promise<Result<{ data: ChartPreviewDTO }>> {
    try {
        const db = getDataViewDb();
        const bundles = await getThemeBundle(db, {
            stockCode: params.stockCode,
            tradeDate: params.tradeDate,
        });

        const self = pickSelfMember(bundles);

        const daily: ChartCandle[] = self
            ? self.daily.map(toDailyChartCandle)
            : [];

        const minute: ChartCandle[] = self
            ? fillMissingMinuteCandles(buildMinuteCandles(self.minute))
            : [];

        const themeOverlay = buildThemeOverlay(bundles, params.stockCode);

        const markerTime = composeUnix(params.tradeDate, params.tradeTime);

        return okResult({ data: { daily, minute, themeOverlay, markerTime } });
    } catch (err) {
        return errResult(err);
    }
}

/* ===========================================================
 * 자기 종목 멤버 선택 (어느 테마 element 든 self 가 있음)
 * =========================================================== */

function pickSelfMember(bundles: ThemeBundle[]): ThemeBundleMember | null {
    for (const b of bundles) {
        const m = b.members.find((x) => x.isSelf);
        if (m) return m;
    }
    return null;
}

/* ===========================================================
 * 일봉 변환 (KRX OHLC + prevClose)
 * =========================================================== */

function toDailyChartCandle(r: DailyCandleRow): ChartCandle {
    return {
        time: dateToUnix(r.tradeDate),
        open: toNum(r.openKrx),
        high: toNum(r.highKrx),
        low: toNum(r.lowKrx),
        close: toNum(r.closeKrx),
        volume: toNum(r.tradingVolumeKrx),
        amount: toNum(r.tradingAmountKrx),
        prevCloseKrx: r.prevCloseKrx != null ? Number(r.prevCloseKrx) : undefined,
        prevCloseNxt: r.prevCloseNxt != null ? Number(r.prevCloseNxt) : undefined,
    };
}

/* ===========================================================
 * 분봉 변환 (NXT 등락률 OHLC, raw 만 있는 봉 제외)
 * =========================================================== */

function buildMinuteCandles(rows: MinuteCandleRow[]): ChartCandle[] {
    const out: ChartCandle[] = [];
    for (const r of rows) {
        if (
            r.openRateNxt === null ||
            r.highRateNxt === null ||
            r.lowRateNxt === null ||
            r.closeRateNxt === null
        ) continue;

        out.push({
            time: r.unixTimestamp,
            open: toNum(r.openRateNxt),
            high: toNum(r.highRateNxt),
            low: toNum(r.lowRateNxt),
            close: toNum(r.closeRateNxt),
            volume: toNum(r.tradingVolume),
            amount: toNum(r.tradingAmount),
            accAmount: toNum(r.accumulatedTradingAmount),
        });
    }
    return out;
}

/* ===========================================================
 * 테마 오버레이 구성
 *  - 모든 테마의 멤버를 합쳐 종목별로 1 시리즈
 *  - 같은 종목이 여러 테마에 등장해도 한 번만 그림
 *  - self 가 첫 번째, peers 는 누적등락률(시리즈 마지막 값) 큰 순
 *  - MAX_OVERLAY_SERIES 로 자르기
 * =========================================================== */

function buildThemeOverlay(
    bundles: ThemeBundle[],
    selfStockCode: string,
): ChartOverlaySeries[] {
    // stockCode → ThemeBundleMember (한 번 등장한 멤버만 사용; 시계열은 동일)
    const memberMap = new Map<string, ThemeBundleMember>();
    for (const b of bundles) {
        for (const m of b.members) {
            if (!memberMap.has(m.stockCode)) memberMap.set(m.stockCode, m);
        }
    }

    const seriesByCode = new Map<string, ChartOverlayPoint[]>();
    for (const [code, m] of memberMap.entries()) {
        const points = buildOverlayPoints(m.minute, m.features);
        if (points.length === 0) continue;
        const filled = fillMissingOverlayPoints(points);
        seriesByCode.set(code, filled);
    }

    const result: ChartOverlaySeries[] = [];

    const selfPoints = seriesByCode.get(selfStockCode);
    if (selfPoints && selfPoints.length > 0) {
        const selfMember = memberMap.get(selfStockCode)!;
        result.push({
            stockCode: selfStockCode,
            stockName: selfMember.stockName,
            isSelf: true,
            series: selfPoints,
        });
    }

    const peers: ChartOverlaySeries[] = [];
    for (const [code, points] of seriesByCode.entries()) {
        if (code === selfStockCode) continue;
        const m = memberMap.get(code)!;
        peers.push({
            stockCode: code,
            stockName: m.stockName,
            isSelf: false,
            series: points,
        });
    }
    peers.sort((a, b) => {
        const av = a.series[a.series.length - 1]?.value ?? 0;
        const bv = b.series[b.series.length - 1]?.value ?? 0;
        return bv - av;
    });

    const remain = Math.max(0, CHART_OVERLAY_MAX_SERIES - result.length);
    return [...result, ...peers.slice(0, remain)];
}

/**
 * 분봉 raw + 분봉 피처 raw 를 합쳐 ChartOverlayPoint[] 로 변환.
 *  - close_rate_nxt 가 null 인 봉은 제외
 *  - features 의 cumulative_trading_amount 를 시간(unix) 기준으로 매칭
 */
function buildOverlayPoints(
    minute: MinuteCandleRow[],
    features: MinuteFeatureRow[],
): ChartOverlayPoint[] {
    // tradeTime 기준으로 features 매핑
    const cumByTime = new Map<string, unknown>();
    for (const f of features) {
        const t = f.tradeTime ?? f.trade_time;
        if (t === undefined || t === null) continue;
        const key = String(t).slice(0, 8);
        cumByTime.set(key, f.cumulativeTradingAmount ?? f.cumulative_trading_amount);
    }

    const out: ChartOverlayPoint[] = [];
    for (const r of minute) {
        if (r.closeRateNxt === null) continue;
        const v = toNum(r.closeRateNxt);
        if (!Number.isFinite(v)) continue;
        const key = String(r.tradeTime).slice(0, 8);
        out.push({
            time: r.unixTimestamp,
            value: v,
            amount: toNum(r.tradingAmount),
            cumAmount: toNum(cumByTime.get(key)),
        });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
}

