// 실시간 복기 보드용 lean 감축 — ChartBundle[](raw 분봉) → 종목별 분당 running 지표(가격/누적).
// raw OHLCV 전체(수십MB) 대신 보드가 쓰는 것만: 시각·종가·running 고저·누적거래대금 + % 기준가.
// 클라가 이걸 들고 시점별 랭킹·top-N·스크럽을 인메모리로(서버 무상태 온더플라이).
// 계산은 core domain 순수함수(previousCloseFromDaily·computeMinuteTradingAmount). 시장=UN(통합).
import { previousCloseFromDaily, computeMinuteTradingAmount } from "@trade-data-manager/market";
import type { ChartBundle } from "@trade-data-manager/market";

/** 종목 1개의 lean 시계열(시간 오름차순). 가격은 원(정수 문자열 아님 — 전송은 number). */
export interface LeanStock {
    code: string;
    /** % 기준가(직전 거래일 UN 종가, 없으면 당일 시가). */
    base: number;
    /** unix seconds(UTC) */
    times: number[];
    /** UN 종가(원) */
    close: number[];
    /** times[i] 까지 당일 고가(원) */
    high: number[];
    /** times[i] 까지 당일 저가(원) */
    low: number[];
    /** times[i] 까지 누적 거래대금(원) */
    cumAmount: number[];
    /** times[i] 까지 "큰 거래대금 분봉"(분당 ≥ AMOUNT_MARK_KRW) 누적 개수. 활동성 지표. */
    bigCount: number[];
}

/** 큰 거래대금 분봉 임계(원) = 30억. chart-review 거래대금 마커 최소 임계와 일치. */
const AMOUNT_MARK_KRW = 3_000_000_000;

export interface LeanBoard {
    date: string;
    stocks: LeanStock[];
}

/** KST(UTC+9) date+time(HH:MM:SS) → unix seconds. */
function kstToUnix(date: string, time: string): number {
    return Math.floor(Date.parse(`${date}T${time}+09:00`) / 1000);
}

export function reduceToLeanBoard(bundles: ChartBundle[], date: string): LeanBoard {
    const stocks: LeanStock[] = [];
    for (const b of bundles) {
        const minutes = b.minutes;
        if (minutes.length === 0) continue;

        const prev = previousCloseFromDaily(b.daily, date);
        const base = prev ? Number(prev.unClose) : Number(minutes[0].un.open);

        const n = minutes.length;
        const times = new Array<number>(n);
        const close = new Array<number>(n);
        const high = new Array<number>(n);
        const low = new Array<number>(n);
        const cumAmount = new Array<number>(n);
        const bigCount = new Array<number>(n);
        let hi = -Infinity;
        let lo = Infinity;
        let cum = 0;
        let big = 0;
        for (let i = 0; i < n; i++) {
            const m = minutes[i];
            hi = Math.max(hi, Number(m.un.high));
            lo = Math.min(lo, Number(m.un.low));
            const minAmount = Number(
                computeMinuteTradingAmount({
                    open: m.un.open,
                    high: m.un.high,
                    low: m.un.low,
                    close: m.un.close,
                    volume: m.un.volume,
                }),
            );
            cum += minAmount;
            if (minAmount >= AMOUNT_MARK_KRW) big += 1;
            times[i] = kstToUnix(m.date, m.time);
            close[i] = Number(m.un.close);
            high[i] = hi;
            low[i] = lo;
            cumAmount[i] = cum;
            bigCount[i] = big;
        }
        stocks.push({ code: b.stockCode, base, times, close, high, low, cumAmount, bigCount });
    }
    return { date, stocks };
}
