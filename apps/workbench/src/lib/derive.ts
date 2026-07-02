// 차트 파생 레이어 — ChartBundle raw(무손실 string) → 분봉 뷰모델(등락률 %·거래대금).
// 설계의 "계산 경계": 서버는 dense 분봉 raw만, 클라가 core/market/domain 순수함수로 파생.
// 이 레이어를 분봉차트와 테마보드가 공용으로 소비한다([[chart-query-inbound-design]]).
import {
    computeChangeRate,
    computeMinuteTradingAmount,
    computeAccumulatedAmounts,
    previousCloseFromDaily,
} from "@trade-data-manager/market/domain";
import type { ChartBundle } from "../api/chart.js";
import type { ChartPriceMode } from "../store/workbench.js";

export interface MinutePoint {
    time: number; // unix seconds (UTC) — lightweight-charts 입력, kstHHmm 가 다시 KST 렌더
    open: number; // 등락률 %
    high: number;
    low: number;
    close: number;
    amount: number; // 이 분봉 거래대금(원)
    cumAmount: number; // 누적 거래대금(원)
}

export interface MinuteView {
    points: MinutePoint[];
    /** % 기준가(직전 거래일 종가)를 못 구해 당일 첫 시가로 폴백했나(상장일 등). */
    baseFallback: boolean;
}

/** KST(UTC+9) date(YYYY-MM-DD)+time(HH:MM:SS) → unix seconds. */
export function kstToUnix(date: string, time: string): number {
    return Math.floor(Date.parse(`${date}T${time}+09:00`) / 1000);
}

/** 일봉 차트 포인트 — raw 가격(등락률 아님) + 거래대금 + 고가마커용 전일종가. time=business day 문자열. */
export interface DailyPoint {
    time: string; // YYYY-MM-DD (lightweight-charts business day)
    open: number;
    high: number;
    low: number;
    close: number;
    amount: number; // 그날 거래대금(원)
    prevClose: number | null; // 직전 거래일 종가(고가 등락률 마커 분모)
}

/** ChartBundle.daily(시간 오름차순) → 일봉 뷰(mode 시장). prevClose = 직전 거래일 종가. */
export function deriveDailyView(bundle: ChartBundle, mode: ChartPriceMode): DailyPoint[] {
    const daily = bundle.daily;
    const out: DailyPoint[] = [];
    for (let i = 0; i < daily.length; i++) {
        const bar = mode === "un" ? daily[i].un : daily[i].krx;
        const prevBar = i > 0 ? (mode === "un" ? daily[i - 1].un : daily[i - 1].krx) : null;
        out.push({
            time: daily[i].date,
            open: Number(bar.open),
            high: Number(bar.high),
            low: Number(bar.low),
            close: Number(bar.close),
            amount: Number(bar.amount),
            prevClose: prevBar ? Number(prevBar.close) : null,
        });
    }
    return out;
}

/**
 * 분봉 뷰 파생. 캔들 O/H/L/C 는 mode 시장 바를 prevClose 대비 %로 환산(차트-리뷰식 % 캔들).
 * 거래대금은 UN(통합) 바 기준으로 통일(항상 존재, OHLC평균×거래량). 누적도 UN.
 * KRX 모드에서 KRX 바가 없는 분(NXT 단독 시간대)은 캔들에서 건너뛴다.
 */
export function deriveMinuteView(bundle: ChartBundle, mode: ChartPriceMode): MinuteView {
    const minutes = bundle.minutes;
    if (minutes.length === 0) return { points: [], baseFallback: false };

    const date = minutes[0].date;

    // 거래대금(UN) 시계열 + 누적 — 도메인 순수함수(BigInt 무손실).
    const unAmounts = minutes.map((c) =>
        computeMinuteTradingAmount({
            open: c.un.open,
            high: c.un.high,
            low: c.un.low,
            close: c.un.close,
            volume: c.un.volume,
        }),
    );
    const cumAmounts = computeAccumulatedAmounts(unAmounts);

    // % 기준가 — 직전 거래일 종가(시장별). 없으면 당일 첫 해당시장 시가로 폴백(상장일).
    const prev = previousCloseFromDaily(bundle.daily, date);
    let base: string | null = prev ? (mode === "un" ? prev.unClose : prev.krxClose) : null;
    let baseFallback = false;
    if (base === null) {
        const first = minutes.find((c) => (mode === "un" ? c.un : c.krx));
        base = first ? (mode === "un" ? first.un.open : first.krx!.open) : null;
        baseFallback = base !== null;
    }

    const points: MinutePoint[] = [];
    minutes.forEach((c, i) => {
        const bar = mode === "un" ? c.un : c.krx;
        if (!bar) return; // KRX 모드에서 KRX 없는 분 → 캔들 생략
        const o = computeChangeRate(bar.open, base);
        const h = computeChangeRate(bar.high, base);
        const l = computeChangeRate(bar.low, base);
        const cl = computeChangeRate(bar.close, base);
        if (o === null || h === null || l === null || cl === null) return;
        points.push({
            time: kstToUnix(c.date, c.time),
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(cl),
            amount: Number(unAmounts[i]),
            cumAmount: Number(cumAmounts[i]),
        });
    });

    return { points, baseFallback };
}
