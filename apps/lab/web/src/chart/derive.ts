// 차트 파생 — ChartBundle(무손실 string) → 차트 포인트(일봉 원화 · 분봉 등락률 %·거래대금).
// tdm-work workbench lib/derive.ts 에서 옮겨 왔다(순수 함수).
import { computeAccumulatedAmounts, computeChangeRate, computeMinuteTradingAmount, kstToUnix } from "../market/domain.js";
import type { ChartBundle, PriceMode } from "../market/types.js";

export interface MinutePoint {
    time: number; // unix seconds — lightweight-charts 입력
    tradeTime: string; // HH:MM:SS
    open: number; // 등락률 %
    high: number;
    low: number;
    close: number;
    amount: number; // 이 분봉 거래대금(원)
    cumAmount: number; // 누적 거래대금(원)
}

export interface MinuteView {
    points: MinutePoint[];
    /** % 기준가(직전 거래일 종가)를 못 구해 당일 첫 시가로 대신했나(상장일 등). */
    baseFallback: boolean;
}

export interface DailyPoint {
    time: string; // YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
    amount: number; // 거래대금(원)
    prevClose: number | null; // 직전 거래일 종가
    /** 고가의 전일비(%) — 마커·툴팁이 같이 읽는다. 전일 종가가 없으면 null. */
    highPct: number | null;
}

/** 일봉 — mode 시장의 바. prevClose = 직전 거래일 종가. */
export function deriveDailyView(bundle: ChartBundle, mode: PriceMode): DailyPoint[] {
    const daily = bundle.daily;
    return daily.map((c, i) => {
        const bar = c[mode];
        const prev = i > 0 ? daily[i - 1][mode] : null;
        const prevClose = prev ? Number(prev.close) : null;
        const high = Number(bar.high);
        return {
            time: c.date,
            open: Number(bar.open),
            high,
            low: Number(bar.low),
            close: Number(bar.close),
            amount: Number(bar.amount),
            prevClose,
            highPct: prevClose && prevClose > 0 ? ((high - prevClose) / prevClose) * 100 : null,
        };
    });
}

/**
 * 분봉 — 봉 모양은 늘 통합(UN) 바(KRX 는 프리마켓·시간외에 없다). mode 는 % 기준가만 바꾼다.
 * 기준가가 없으면(상장일) 당일 첫 UN 시가로 대신한다.
 */
export function deriveMinuteView(bundle: ChartBundle, mode: PriceMode): MinuteView {
    const minutes = bundle.minutes;
    if (minutes.length === 0) return { points: [], baseFallback: false };

    const amounts = minutes.map((c) => computeMinuteTradingAmount(c.un));
    const cums = computeAccumulatedAmounts(amounts);

    const sel = bundle.basePrice ? bundle.basePrice[mode] : null;
    const baseFallback = sel === null;
    const base = sel !== null ? String(sel) : minutes[0].un.open;

    const points: MinutePoint[] = [];
    minutes.forEach((c, i) => {
        const bar = c.un;
        const o = computeChangeRate(bar.open, base);
        const h = computeChangeRate(bar.high, base);
        const l = computeChangeRate(bar.low, base);
        const cl = computeChangeRate(bar.close, base);
        if (o === null || h === null || l === null || cl === null) return;
        points.push({
            time: kstToUnix(c.date, c.time),
            tradeTime: c.time,
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(cl),
            amount: Number(amounts[i]),
            cumAmount: Number(cums[i]),
        });
    });
    return { points, baseFallback };
}
