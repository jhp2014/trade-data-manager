// 리플레이 토대 — 그날 전 종목 raw 분봉을 1회 프리컴퓨트해 시점별 스냅샷을 O(종목)으로 뽑는다.
// EOD 보드 = snapshotAt(t=장마감). Phase2b 스크러버는 t만 움직이면 재사용된다.
// 시장 = UN(통합) 기준(보드는 단일축, 차트만 KRX/UN 토글). 계산은 (price-base)/base*100 = computeChangeRate 형식.
import { previousCloseFromDaily, computeMinuteTradingAmount } from "@trade-data-manager/market/domain";
import type { ChartBundle } from "../api/chart.js";
import { kstToUnix } from "./derive.js";

/** 종목 1개의 프리컴퓨트 시리즈 — 분 인덱스로 running high/low/close/누적을 담는다(시간 오름차순). */
export interface StockSeries {
    code: string;
    times: number[]; // unix seconds asc (dense)
    close: number[]; // UN 종가(원)
    runHigh: number[]; // times[i] 까지의 당일 고가(원)
    runLow: number[]; // times[i] 까지의 당일 저가(원)
    cumAmount: number[]; // times[i] 까지의 누적 거래대금(원)
    open: number; // 당일 시가(원, UN)
    base: number; // % 기준가(직전 거래일 종가, 없으면 당일 시가)
}

export interface DayModel {
    byCode: Map<string, StockSeries>;
    /** 그날 마지막 분봉 시각(모든 종목 통합 최대) — EOD 스냅샷 기본 t. */
    endTime: number;
    /** 그날 첫 분봉 시각(스크러버 하한). */
    startTime: number;
}

export interface StockSnapshot {
    code: string;
    rate: number; // 등락률 %(t 시점 종가 기준)
    openPct: number;
    highPct: number; // t 까지 당일 고가 %
    lowPct: number; // t 까지 당일 저가 %
    cumAmount: number; // t 까지 누적 거래대금(원)
}

/** raw 번들[] → 프리컴퓨트 DayModel. minutes 없는 종목은 제외. */
export function buildDayModel(bundles: ChartBundle[], date: string): DayModel {
    const byCode = new Map<string, StockSeries>();
    let endTime = 0;
    let startTime = Number.POSITIVE_INFINITY;

    for (const b of bundles) {
        const minutes = b.minutes;
        if (minutes.length === 0) continue;

        const prev = previousCloseFromDaily(b.daily, date);
        const open = Number(minutes[0].un.open);
        const base = prev ? Number(prev.unClose) : open;

        const n = minutes.length;
        const times = new Array<number>(n);
        const close = new Array<number>(n);
        const runHigh = new Array<number>(n);
        const runLow = new Array<number>(n);
        const cumAmount = new Array<number>(n);
        let hi = -Infinity;
        let lo = Infinity;
        let cum = 0;
        for (let i = 0; i < n; i++) {
            const m = minutes[i];
            const c = Number(m.un.close);
            hi = Math.max(hi, Number(m.un.high));
            lo = Math.min(lo, Number(m.un.low));
            cum += Number(
                computeMinuteTradingAmount({
                    open: m.un.open,
                    high: m.un.high,
                    low: m.un.low,
                    close: m.un.close,
                    volume: m.un.volume,
                }),
            );
            times[i] = kstToUnix(m.date, m.time);
            close[i] = c;
            runHigh[i] = hi;
            runLow[i] = lo;
            cumAmount[i] = cum;
        }
        byCode.set(b.stockCode, { code: b.stockCode, times, close, runHigh, runLow, cumAmount, open, base });
        endTime = Math.max(endTime, times[n - 1]);
        startTime = Math.min(startTime, times[0]);
    }

    return { byCode, endTime, startTime: Number.isFinite(startTime) ? startTime : 0 };
}

/** times 에서 t 이하 마지막 인덱스(이진탐색). 없으면 -1. */
function lastIndexAtOrBefore(times: number[], t: number): number {
    let lo = 0;
    let hi = times.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

/** 시점 t의 종목 스냅샷. t 이전 분봉이 없으면 null(아직 미개장/데이터 전). */
export function snapshotAt(s: StockSeries, t: number): StockSnapshot | null {
    const i = lastIndexAtOrBefore(s.times, t);
    if (i < 0) return null;
    const base = s.base;
    const pct = (p: number): number => ((p - base) / base) * 100;
    return {
        code: s.code,
        rate: pct(s.close[i]),
        openPct: pct(s.open),
        highPct: pct(s.runHigh[i]),
        lowPct: pct(s.runLow[i]),
        cumAmount: s.cumAmount[i],
    };
}
