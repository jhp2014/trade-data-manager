// 캔들 오버레이의 **순수 계산** — 두 소스를 골격 뷰의 한 좌표계로 옮긴다.
//
// ## 소스는 이미 있는 것을 쓴다 — 조합하지 않는다
//   · 앵커(주인공) = **`/chart` 번들의 당일 dense 분봉**. 골격 피벗이 해소되는 그 **원주가**라 손으로 찍은
//     점이 자기 캔들 꼭짓점에 정확히 앉고, `volume` 이 같이 와서 거래대금까지 **한 응답**에서 나온다.
//     (한때 `/rank-minutes`(가격만) + 스냅샷(대금)을 합치려 했는데, 두 군데서 모아 조합할 바엔
//      종목·날짜로 그 종목 데이터를 통째로 받는 게 근본이라는 판단 — 딸려오는 2년 일봉은 버린다.
//      덤: RQ 키 `["chart", code, date]` 가 차트 패널들과 **공유**라 이미 떠 있으면 왕복이 0이다.)
//   · 테마 멤버 = 이미 받은 복기 스냅샷의 분당 OHLC(%) — 추가 왕복 0. 분모가 복기 기준가(원주가 +
//     이벤트 보정)라 앵커와 미세하게 갈릴 수 있지만 배경 참고용이라 수용한다.
//
// ## 거래대금은 **도메인 공식 하나**를 통과한다
// `computeMinuteTradingAmount`(OHLC평균×량)는 서버가 스냅샷 `cumAmount` 를 굽는 바로 그 함수다.
// 그래서 마커(차트 번들)와 굵기(스냅샷)가 다른 경로로 와도 숫자가 갈릴 수 없다.
//
// ## 좌표는 언제나 뷰 공간
// 가격 → y 는 `pct(price, basePrice) − baseRate`(골격 피벗과 같은 식), x 는 `벽시계 − baseT`.
// 스냅샷은 이미 %라 `−baseRate` 만 한다.
//
// ## 빈 분은 **평탄봉으로 채운다**(사용자 확정)
// 골격 선·테마 선·캔들 전부 "모든 시간에 값이 있다"로 통일한다. 앵커는 소스가 이미 dense 라 그대로 두고
// (거래량 0 채움봉도 캔들로 그린다), 멤버는 여기서 직전 값을 끌어 채운다. 선두 갭(첫 값 이전)만은
// 못 채운다 — 끌어올 직전 값이 없다(densifyMinutes 의 규칙과 같다).
import { computeMinuteTradingAmount } from "@trade-data-manager/market/domain";
import { pct } from "./skeletonOverlay.js";

/** 뷰 공간의 캔들 하나 — x = 타점 대비 분, y 넷은 % 공간. `amount` 는 그 분 거래대금(원, 없으면 0). */
export interface ViewCandle {
    x: number;
    o: number;
    h: number;
    l: number;
    c: number;
    amount: number;
}

/** 원주가 분봉 하나 — `/chart` 번들의 MinuteCandle 중 이 모듈이 쓰는 부분(UN 한 벌). */
export interface RawMinute {
    time: string; // HH:MM:SS
    un: { open: string; high: string; low: string; close: string; volume: string };
}

/** `HH:MM(:SS)` → 자정 기준 분. skeletonOverlay.minutesOf 와 같은 규칙(초는 버린다). */
const minuteOf = (hms: string): number => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));

/**
 * 무손실 string → 가격. **빈 문자열을 0으로 받지 않는다** — `Number("")` 는 0이고 그건 유한하므로,
 * 소박한 Number.isFinite 검사만으로는 값 없는 봉이 "0원 캔들"로 통과한다(−100% 짜리 꼬리가 생긴다).
 * 가격은 양수여야 하므로 그 조건 하나로 빈 값·0·음수·쓰레기를 한꺼번에 막는다.
 */
const priceOf = (s: string): number => {
    const v = Number(s);
    return Number.isFinite(v) && v > 0 ? v : NaN;
};

/**
 * 앵커 캔들 — 원주가 분봉을 뷰 공간으로. **자르지 않는다**: 하루치(장 마감 20시까지)를 전부 만들어
 * 확대·이동으로 어디를 가도 캔들이 있게 한다(초기 창으로 자르면 프레임 밖은 영영 빈 화면이다 —
 * 확대·이동은 bounds 가 아니라 스케일 변환이라 다시 만들어지지 않는다).
 * 값이 하나라도 가격이 아니면 그 봉은 건너뛴다 — 반쪽 캔들은 지어낸 그림이다.
 */
export function anchorCandles(
    bars: readonly RawMinute[],
    origin: { basePrice: number; baseRate: number; baseT: number },
): ViewCandle[] {
    if (origin.basePrice <= 0) return [];
    const out: ViewCandle[] = [];
    const y = (price: number): number => pct(price, origin.basePrice) - origin.baseRate;
    for (const b of bars) {
        const o = priceOf(b.un.open);
        const h = priceOf(b.un.high);
        const l = priceOf(b.un.low);
        const c = priceOf(b.un.close);
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
        // 거래대금은 **도메인 공식**으로 — 스냅샷 cumAmount 를 굽는 그 함수라 두 경로의 숫자가 같다.
        const amount = Number(computeMinuteTradingAmount(b.un));
        out.push({
            x: minuteOf(b.time) - origin.baseT,
            o: y(o), h: y(h), l: y(l), c: y(c),
            amount: Number.isFinite(amount) ? amount : 0,
        });
    }
    return out;
}

/** 스냅샷 한 종목의 분당 OHLC(%) — 벽시계 분으로 찾는다(테마 선의 MinuteSeries 와 같은 색인). */
export interface MinuteOhlcSeries {
    index: ReadonlyMap<number, number>;
    open: readonly number[];
    high: readonly number[];
    low: readonly number[];
    close: readonly number[];
    /** 누적 거래대금(원) — 인접 차분이 그 분의 거래대금. 마커가 쓴다. */
    cumAmount: readonly number[];
}

/**
 * 테마 멤버 캔들 — 스냅샷 %를 뷰 공간으로(평행이동만). 구간은 **벽시계** `[from, to]`.
 * 빠진 분은 **직전 종가 평탄봉**(O=H=L=C=직전 종가, 거래대금 0)으로 채운다(사용자 확정) —
 * 첫 값 이전은 못 채운다(끌어올 값이 없다).
 */
export function memberCandles(
    from: number,
    to: number,
    series: MinuteOhlcSeries,
    origin: { baseRate: number; baseT: number },
): ViewCandle[] {
    const out: ViewCandle[] = [];
    let prevClose: number | null = null;
    for (let m = from; m <= to; m++) {
        const i = series.index.get(m);
        const x = m - origin.baseT;
        if (i == null) {
            if (prevClose === null) continue; // 선두 갭 — 지어낼 직전 값이 없다
            out.push({ x, o: prevClose, h: prevClose, l: prevClose, c: prevClose, amount: 0 });
            continue;
        }
        const o = series.open[i];
        const h = series.high[i];
        const l = series.low[i];
        const c = series.close[i];
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
        const amount = series.cumAmount[i] - (i > 0 ? series.cumAmount[i - 1] : 0);
        prevClose = c - origin.baseRate;
        out.push({
            x, o: o - origin.baseRate, h: h - origin.baseRate, l: l - origin.baseRate, c: prevClose,
            amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        });
    }
    return out;
}

/**
 * 캔들 몸통의 화면 폭(px). 1분이 화면에서 차지하는 폭의 70%(봉 사이를 벌려 개별 봉이 읽히게).
 * 상한 9px — 크게 확대했을 때 몸통이 통나무가 되면 골격 선이 그 뒤로 숨는다.
 */
export const candleWidth = (pxPerMinute: number): number => Math.min(9, Math.max(0, pxPerMinute * 0.7));

/**
 * 이 배율에서 캔들을 그릴 수 있나 — 몸통이 **1.5px 미만이면 선으로 떨어뜨린다**(사용자 확정 방향).
 * 그 아래에선 700봉이 서로 붙어 잉크 덩어리가 될 뿐이고, 그 상태의 "어디가 컸나"는 골격 선이 답한다.
 */
export const CANDLE_MIN_WIDTH = 1.5;
export const candlesVisible = (pxPerMinute: number): boolean => candleWidth(pxPerMinute) >= CANDLE_MIN_WIDTH;
