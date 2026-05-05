import { sql, and, eq, asc, lte, inArray } from "drizzle-orm";
import {
    stocks,
    dailyCandles,
    minuteCandles,
} from "@trade-data-manager/market-data";
import type { Database } from "../index";

/* ===========================================================
 * 차트 미리보기 데이터
 *
 * 카드 hover 시 popover 에 표시할 일봉/분봉/테마 오버레이.
 * 모두 unix seconds 로 시간 정규화하여 lightweight-charts 와 호환.
 * =========================================================== */

export interface ChartCandle {
    time: number; // unix seconds (UTC)
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    amount?: number; // 분봉 거래대금 (KRW), 분봉에서만 사용
    prevCloseKrx?: number; // 일봉에서만 사용 — 모달의 KRX% 계산용
    prevCloseNxt?: number; // 일봉에서만 사용 — 모달의 NXT% 계산용
}

export interface ChartOverlayPoint {
    time: number;
    value: number;           // closeRateNxt (%)
    amount: number;          // trading_amount (원)
    cumAmount: number;       // cumulative_trading_amount (원)
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

export interface ChartPreviewData {
    /** 240 거래일 일봉 (KRX 가격 OHLC) */
    daily: ChartCandle[];
    /** 당일 분봉 (NXT 등락률 % OHLC) — 전일 NXT 종가 기준 */
    minute: ChartCandle[];
    /** 같은 테마 종목들의 당일 분봉 closeRateNxt(%) 오버레이 */
    themeOverlay: ChartOverlaySeries[];
    markerTime: number | null;
}

/* ===========================================================
 * fetchChartPreview
 * =========================================================== */

const DAILY_LOOKBACK = 240;  // 60 → 240 (약 1년)

export async function fetchChartPreview(
    db: Database,
    params: {
        stockCode: string;
        tradeDate: string;
        tradeTime: string;
    }
): Promise<ChartPreviewData> {
    const [daily, minute, themeOverlay] = await Promise.all([
        fetchDaily(db, params.stockCode, params.tradeDate),
        fetchMinute(db, params.stockCode, params.tradeDate),
        fetchThemeOverlay(db, params.stockCode, params.tradeDate),
    ]);

    const markerTime = composeUnix(params.tradeDate, params.tradeTime);

    return { daily, minute, themeOverlay, markerTime };
}

/* ===========================================================
 * 일봉 — DAILY_LOOKBACK 거래일치
 * =========================================================== */

async function fetchDaily(
    db: Database,
    stockCode: string,
    tradeDate: string
): Promise<ChartCandle[]> {
    // tradeDate 까지 포함해 과거 N개 거래일 ASC
    const rows = await db
        .select({
            tradeDate: dailyCandles.tradeDate,
            open: dailyCandles.openKrx,
            high: dailyCandles.highKrx,
            low: dailyCandles.lowKrx,
            close: dailyCandles.closeKrx,
            volume: dailyCandles.tradingVolumeKrx,
            amount: dailyCandles.tradingAmountKrx,
            prevCloseKrx: dailyCandles.prevCloseKrx,
            prevCloseNxt: dailyCandles.prevCloseNxt,
        })
        .from(dailyCandles)
        .where(
            and(
                eq(dailyCandles.stockCode, stockCode),
                lte(dailyCandles.tradeDate, tradeDate)
            )
        )
        .orderBy(sql`${dailyCandles.tradeDate} DESC`)
        .limit(DAILY_LOOKBACK);

    // ASC 로 뒤집어서 차트 시간순 정렬
    const ascRows = rows.slice().reverse();

    return ascRows.map((r) => ({
        time: dateToUnix(r.tradeDate as any),
        open: toNum(r.open),
        high: toNum(r.high),
        low: toNum(r.low),
        close: toNum(r.close),
        volume: toNum(r.volume),
        prevCloseKrx: r.prevCloseKrx != null ? Number(r.prevCloseKrx) : undefined,
        prevCloseNxt: r.prevCloseNxt != null ? Number(r.prevCloseNxt) : undefined,
    }));
}

/* ===========================================================
 * 분봉 — 당일 전체
 * =========================================================== */

async function fetchMinute(
    db: Database,
    stockCode: string,
    tradeDate: string
): Promise<ChartCandle[]> {
    const rows = await db
        .select({
            tradeTime: minuteCandles.tradeTime,
            unixTimestamp: minuteCandles.unixTimestamp,
            openRateNxt: minuteCandles.openRateNxt,
            highRateNxt: minuteCandles.highRateNxt,
            lowRateNxt: minuteCandles.lowRateNxt,
            closeRateNxt: minuteCandles.closeRateNxt,
            volume: minuteCandles.tradingVolume,
            amount: minuteCandles.tradingAmount,
        })
        .from(minuteCandles)
        .where(
            and(
                eq(minuteCandles.stockCode, stockCode),
                eq(minuteCandles.tradeDate, tradeDate)
            )
        )
        .orderBy(asc(minuteCandles.tradeTime));

    const result: ChartCandle[] = [];
    for (const r of rows) {
        // RateNxt 4개 모두 존재하는 행만 캔들로 사용
        if (
            r.openRateNxt === null ||
            r.highRateNxt === null ||
            r.lowRateNxt === null ||
            r.closeRateNxt === null
        ) {
            continue;
        }
        result.push({
            time: r.unixTimestamp,
            open: toNum(r.openRateNxt),
            high: toNum(r.highRateNxt),
            low: toNum(r.lowRateNxt),
            close: toNum(r.closeRateNxt),
            volume: toNum(r.volume),
            amount: toNum(r.amount),
        });
    }
    return result;
}
/* ===========================================================
 * 테마 오버레이 — 같은 (themeId, tradeDate) 종목들의 당일 분봉 closeRateNxt
 *                + trading_amount + cumulative_trading_amount
 * =========================================================== */

async function fetchThemeOverlay(
    db: Database,
    stockCode: string,
    tradeDate: string
): Promise<ChartOverlaySeries[]> {
    // 1) 자기 종목이 그날 속한 themeId 들
    const themeRows = await db.execute(sql`
        SELECT DISTINCT t.theme_id, t.theme_name
        FROM daily_candles dc
        JOIN daily_theme_mappings dtm ON dtm.daily_candle_id = dc.id
        JOIN themes t ON t.theme_id = dtm.theme_id
        WHERE dc.stock_code = ${stockCode} AND dc.trade_date = ${tradeDate}::date
    `);
    const themeList = (themeRows as unknown as {
        rows: Array<{ theme_id: string | bigint; theme_name: string }>;
    }).rows;

    if (themeList.length === 0) {
        // 자기 종목만이라도 그려준다
        return await fetchSelfOnlyOverlay(db, stockCode, tradeDate);
    }

    const themeIds = themeList.map((t) => String(t.theme_id));

    // 2) 그 테마들에 속한 (그날의) 모든 종목 코드
    const peerCodeRows = await db.execute(sql`
        SELECT DISTINCT dc.stock_code
        FROM daily_theme_mappings dtm
        JOIN daily_candles dc ON dc.id = dtm.daily_candle_id
        WHERE dtm.theme_id IN (${sql.join(
        themeIds.map((id) => sql`${id}::bigint`),
        sql`, `
    )})
          AND dc.trade_date = ${tradeDate}::date
    `);
    const peerCodes = (peerCodeRows as unknown as {
        rows: Array<{ stock_code: string }>;
    }).rows.map((r) => r.stock_code);

    // 자기 종목 보장
    const codeSet = new Set(peerCodes);
    codeSet.add(stockCode);
    const allCodes = Array.from(codeSet);

    // 3) 종목명
    const nameRows = await db
        .select({
            stockCode: stocks.stockCode,
            stockName: stocks.stockName,
        })
        .from(stocks)
        .where(inArray(stocks.stockCode, allCodes));
    const nameMap = new Map(nameRows.map((r) => [r.stockCode, r.stockName]));

    // 4) 당일 분봉 closeRateNxt + trading_amount + cumulative_trading_amount
    //    (cumulative_trading_amount 는 minute_candle_features 에 있으므로 join 필요)
    const seriesResult = await db.execute(sql`
        SELECT
            mc.stock_code,
            mc.unix_timestamp,
            mcf.close_rate_nxt,
            mc.trading_amount,
            mcf.cumulative_trading_amount
        FROM minute_candle_features mcf
        JOIN minute_candles mc ON mc.id = mcf.minute_candle_id
        WHERE mc.trade_date = ${tradeDate}::date
          AND mc.stock_code IN (${sql.join(
        allCodes.map((c) => sql`${c}`),
        sql`, `
    )})
        ORDER BY mc.stock_code, mc.trade_time
    `);
    const seriesRows = (seriesResult as unknown as {
        rows: Array<{
            stock_code: string;
            unix_timestamp: number | string;
            close_rate_nxt: number | string | null;
            trading_amount: number | string | null;
            cumulative_trading_amount: number | string | null;
        }>;
    }).rows;

    // 5) 종목별 grouping
    const grouped = new Map<string, ChartOverlayPoint[]>();
    for (const r of seriesRows) {
        if (r.close_rate_nxt === null) continue;
        const v = toNum(r.close_rate_nxt);
        if (!Number.isFinite(v)) continue;
        const t =
            typeof r.unix_timestamp === "string"
                ? Number(r.unix_timestamp)
                : r.unix_timestamp;
        const arr = grouped.get(r.stock_code) ?? [];
        arr.push({
            time: t,
            value: v,
            amount: toNum(r.trading_amount),
            cumAmount: toNum(r.cumulative_trading_amount),
        });
        grouped.set(r.stock_code, arr);
    }

    // 6) 결과 — 자기 종목을 첫번째로
    const result: ChartOverlaySeries[] = [];
    const selfPoints = grouped.get(stockCode);
    if (selfPoints && selfPoints.length > 0) {
        result.push({
            stockCode,
            stockName: nameMap.get(stockCode) ?? stockCode,
            isSelf: true,
            series: selfPoints,
        });
    }

    // 동반 종목 — 마지막값(누적등락률) 큰 순으로 정렬
    const peers: ChartOverlaySeries[] = [];
    for (const [code, points] of grouped.entries()) {
        if (code === stockCode) continue;
        if (points.length === 0) continue;
        peers.push({
            stockCode: code,
            stockName: nameMap.get(code) ?? code,
            isSelf: false,
            series: points,
        });
    }
    peers.sort((a, b) => {
        const av = a.series[a.series.length - 1]?.value ?? 0;
        const bv = b.series[b.series.length - 1]?.value ?? 0;
        return bv - av;
    });

    // 너무 많으면 잘라냄 — 가독성 + 성능
    const MAX_SERIES = 10;
    const remain = Math.max(0, MAX_SERIES - result.length);
    return [...result, ...peers.slice(0, remain)];
}

async function fetchSelfOnlyOverlay(
    db: Database,
    stockCode: string,
    tradeDate: string
): Promise<ChartOverlaySeries[]> {
    const rowsResult = await db.execute(sql`
        SELECT
            mc.unix_timestamp,
            mcf.close_rate_nxt,
            mc.trading_amount,
            mcf.cumulative_trading_amount
        FROM minute_candle_features mcf
        JOIN minute_candles mc ON mc.id = mcf.minute_candle_id
        WHERE mc.stock_code = ${stockCode}
          AND mc.trade_date = ${tradeDate}::date
        ORDER BY mc.trade_time
    `);
    const rows = (rowsResult as unknown as {
        rows: Array<{
            unix_timestamp: number | string;
            close_rate_nxt: number | string | null;
            trading_amount: number | string | null;
            cumulative_trading_amount: number | string | null;
        }>;
    }).rows;

    const series: ChartOverlayPoint[] = [];
    for (const r of rows) {
        if (r.close_rate_nxt === null) continue;
        const v = toNum(r.close_rate_nxt);
        if (!Number.isFinite(v)) continue;
        const t =
            typeof r.unix_timestamp === "string"
                ? Number(r.unix_timestamp)
                : r.unix_timestamp;
        series.push({
            time: t,
            value: v,
            amount: toNum(r.trading_amount),
            cumAmount: toNum(r.cumulative_trading_amount),
        });
    }

    if (series.length === 0) return [];

    const nameRow = await db
        .select({ stockName: stocks.stockName })
        .from(stocks)
        .where(eq(stocks.stockCode, stockCode))
        .limit(1);
    const stockName = nameRow[0]?.stockName ?? stockCode;

    return [{ stockCode, stockName, isSelf: true, series }];
}

/* ===========================================================
 * 변환 헬퍼
 * =========================================================== */

function toNum(v: unknown): number {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "bigint") return Number(v);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** 'YYYY-MM-DD' (KST 가정) → unix seconds (UTC) */
function dateToUnix(v: any): number {
    const s = typeof v === "string" ? v.slice(0, 10) : "";
    if (!s) {
        if (v instanceof Date) return Math.floor(v.getTime() / 1000);
        return 0;
    }
    // 한국 일봉이라 09:00 KST = 00:00 UTC 로 정규화하여 lightweight-charts 가
    // 일자별로 스냅하기 좋게 한다
    const t = new Date(s + "T00:00:00+09:00");
    return Math.floor(t.getTime() / 1000);
}

/** 'YYYY-MM-DD' + 'HH:mm:ss' (KST) → unix seconds */
function composeUnix(tradeDate: string, tradeTime: string): number | null {
    if (!tradeDate || !tradeTime) return null;
    const t = new Date(`${tradeDate.slice(0, 10)}T${tradeTime.slice(0, 8)}+09:00`);
    const sec = Math.floor(t.getTime() / 1000);
    return Number.isFinite(sec) ? sec : null;
}
