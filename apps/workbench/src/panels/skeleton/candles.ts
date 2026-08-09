// 캔들 오버레이의 **순수 계산** — 두 소스를 골격 뷰의 한 좌표계로 옮긴다.
//
// ## 왜 소스가 둘인가(그리고 왜 섞으면 안 되는가)
//   · 앵커(주인공) = `/rank-minutes` **원주가 UN 분봉** — 골격 피벗이 해소되는 바로 그 소스라
//     손으로 찍은 점이 자기 캔들의 꼭짓점에 **정확히** 앉는다(보정 상수가 원리적으로 필요 없다).
//   · 테마 멤버 = 이미 받은 복기 스냅샷의 **분당 OHLC(%)** — 추가 왕복 0. 다만 분모가 복기 기준가
//     (원주가 + 이벤트 보정)라 앵커와 미세하게 갈릴 수 있다. 배경 참고용이라 수용하는 것이고,
//     주인공에까지 이 소스를 쓰면 피벗이 캔들 밖에 뜬다 — 그 순간 골격 자체가 의심받는다.
//
// ## 좌표는 언제나 뷰 공간
// 가격 → y 는 `pct(price, basePrice) − baseRate`(골격 피벗과 같은 식), x 는 `벽시계 − baseT`.
// 스냅샷은 이미 %라 `−baseRate` 만 한다. 두 경로가 같은 함수를 통과해야 한 그림이 된다.
import { pct } from "./skeletonOverlay.js";

/** 뷰 공간의 캔들 하나 — x = 타점 대비 분, y 넷은 % (전일 종가 대비 %p 차이 공간). */
export interface ViewCandle {
    x: number;
    o: number;
    h: number;
    l: number;
    c: number;
}

/** 원주가 분봉 하나(무손실 string) — 와이어 RankMinuteBar 중 이 모듈이 쓰는 부분. */
export interface RawBar {
    time: string; // HH:MM:SS
    open: string;
    high: string;
    low: string;
    close: string;
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
 * 앵커 캔들 — 원주가 분봉을 뷰 공간으로. `[from, to]`(뷰 x) 밖은 버린다(화면 밖을 그리지 않는다).
 * 값 하나라도 숫자가 아니면 그 봉은 건너뛴다 — 반쪽 캔들은 지어낸 그림이다.
 */
export function anchorCandles(
    bars: readonly RawBar[],
    origin: { basePrice: number; baseRate: number; baseT: number },
    range: { from: number; to: number },
): ViewCandle[] {
    if (origin.basePrice <= 0) return [];
    const out: ViewCandle[] = [];
    for (const b of bars) {
        const x = minuteOf(b.time) - origin.baseT;
        if (x < range.from || x > range.to) continue;
        const o = priceOf(b.open);
        const h = priceOf(b.high);
        const l = priceOf(b.low);
        const c = priceOf(b.close);
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
        const y = (price: number): number => pct(price, origin.basePrice) - origin.baseRate;
        out.push({ x, o: y(o), h: y(h), l: y(l), c: y(c) });
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
}

/**
 * 테마 멤버 캔들 — 스냅샷 %를 뷰 공간으로(평행이동만). 구간은 **벽시계** `[from, to]`,
 * 거래가 없어 빠진 분은 건너뛴다(없는 봉을 직전 값으로 지어내지 않는다 — memberPath 와 같은 태도).
 */
export function memberCandles(
    from: number,
    to: number,
    series: MinuteOhlcSeries,
    origin: { baseRate: number; baseT: number },
): ViewCandle[] {
    const out: ViewCandle[] = [];
    for (let m = from; m <= to; m++) {
        const i = series.index.get(m);
        if (i == null) continue;
        const o = series.open[i];
        const h = series.high[i];
        const l = series.low[i];
        const c = series.close[i];
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
        out.push({ x: m - origin.baseT, o: o - origin.baseRate, h: h - origin.baseRate, l: l - origin.baseRate, c: c - origin.baseRate });
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
 * 그 아래에선 400봉이 서로 붙어 잉크 덩어리가 될 뿐이고, 그 상태의 "어디가 컸나"는 골격 선이 답한다.
 */
export const CANDLE_MIN_WIDTH = 1.5;
export const candlesVisible = (pxPerMinute: number): boolean => candleWidth(pxPerMinute) >= CANDLE_MIN_WIDTH;
