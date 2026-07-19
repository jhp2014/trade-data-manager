// 차트 파생 레이어 — ChartBundle raw(무손실 string) → 분봉 뷰모델(등락률 %·거래대금).
// 설계의 "계산 경계": 서버는 dense 분봉 raw만, 클라가 core/market/domain 순수함수로 파생.
// 이 레이어를 분봉차트와 테마보드가 공용으로 소비한다([[chart-query-inbound-design]]).
import {
    computeChangeRate,
    computeMinuteTradingAmount,
    computeAccumulatedAmounts,
    kstToUnix,
} from "@trade-data-manager/market/domain";
import type { ChartBundle } from "../api/chart.js";
import type { ChartPriceMode } from "../store/workbench.js";

export interface MinutePoint {
    time: number; // unix seconds (UTC) — lightweight-charts 입력, kstHHmm 가 다시 KST 렌더
    date: string; // YYYY-MM-DD (KST 거래일) — 가격선(M) 앵커 키
    tradeTime: string; // HH:MM:SS (KST) — 가격선(M) 앵커 키
    open: number; // 등락률 %
    high: number;
    low: number;
    close: number;
    amount: number; // 이 분봉 거래대금(원)
    cumAmount: number; // 누적 거래대금(원)
    highPrice: number; // raw 고가(원) — 우클릭 가격선(M) 기준
}

export interface MinuteView {
    points: MinutePoint[];
    /** % 기준가(직전 거래일 종가)를 못 구해 당일 첫 시가로 폴백했나(상장일 등). */
    baseFallback: boolean;
    /** % 기준가(원). 가격선(원)→% 변환에 쓴다. */
    base: number | null;
}

// KST 변환은 core/market/domain 단일 출처. 소비자 편의를 위해 derive 에서 재노출.
export { kstToUnix };

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

/**
 * 검색일 기준 전일종가 — date 직전(미만) 마지막 봉의 종가(수정주가, mode 시장).
 * date 봉이 없어도(주말·장전) 직전 거래일 종가가 나온다. 첫 봉 이전이면 null.
 * 크로스헤어 %·+30% 가이드선의 분모(검색일 고정 base).
 */
export function prevCloseAsOf(points: DailyPoint[], date: string): number | null {
    let prev: DailyPoint | null = null;
    for (const p of points) {
        if (p.time >= date) break; // 오름차순 — date 도달 시 종료
        prev = p;
    }
    return prev ? prev.close : null;
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
 * 분봉 뷰 파생. 캔들 O/H/L/C 는 항상 UN(통합) 바를 prevClose 대비 %로 환산(차트-리뷰식 % 캔들).
 * 시장 토글(mode)은 % 기준가(base=직전 종가)만 KRX↔UN 으로 바꾼다 — 봉 형태는 UN 고정(UN 은 늘 존재,
 * KRX 는 프리마켓·시간외에 부재). 거래대금·누적도 UN. base 없으면(상장일) 당일 첫 UN 시가로 폴백.
 */
export function deriveMinuteView(bundle: ChartBundle, mode: ChartPriceMode): MinuteView {
    const minutes = bundle.minutes;
    if (minutes.length === 0) return { points: [], baseFallback: false, base: null };

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

    // % 기준가 — 서버가 basePrice 스칼라로 실어줌(원주가 직전 종가 + 감자·액분 조정계수 보정, 당일 원주가 스케일).
    // 분봉이 원주가라 base 도 같은 스케일이어야 맞다(이벤트 낀 날 보정 없인 % 폭주). 없으면 당일 첫 시가로 폴백(상장일).
    const sel = bundle.basePrice ? bundle.basePrice[mode === "un" ? "un" : "krx"] : null;
    let base: string | null = sel !== null ? String(sel) : null;
    let baseFallback = false;
    if (base === null) {
        base = minutes[0].un.open; // UN 은 늘 존재 → 당일 첫 UN 시가로 폴백
        baseFallback = true;
    }

    const points: MinutePoint[] = [];
    minutes.forEach((c, i) => {
        const bar = c.un; // 형태는 항상 UN — 시장 토글은 base(%) 만 바꾼다
        const o = computeChangeRate(bar.open, base);
        const h = computeChangeRate(bar.high, base);
        const l = computeChangeRate(bar.low, base);
        const cl = computeChangeRate(bar.close, base);
        if (o === null || h === null || l === null || cl === null) return;
        points.push({
            time: kstToUnix(c.date, c.time),
            date: c.date,
            tradeTime: c.time,
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(cl),
            amount: Number(unAmounts[i]),
            cumAmount: Number(cumAmounts[i]),
            highPrice: Number(bar.high),
        });
    });

    return { points, baseFallback, base: base !== null ? Number(base) : null };
}
