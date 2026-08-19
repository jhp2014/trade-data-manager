// 캔들 오버레이의 **순수 계산** — 두 소스를 골격 뷰의 한 좌표계로 옮긴다.
//
// ## 소스는 이미 있는 것을 쓴다 — 조합하지 않는다
//   · 앵커(주인공) = **`/chart` 번들의 당일 dense 분봉**. 골격 피벗이 해소되는 그 **원주가**라 손으로 찍은
//     점이 자기 캔들 꼭짓점에 정확히 앉고, `volume` 이 같이 와서 거래대금까지 **한 응답**에서 나온다.
//     (한때 가격만 주는 별도 순위 분봉 API + 스냅샷(대금)을 합치려 했는데, 두 군데서 모아 조합할 바엔
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
import { minutesOfDay } from "../../lib/date.js";
import { pct } from "./skeletonOverlay.js";

/** 뷰 공간의 캔들 하나 — x = 타점 대비 분, y 넷은 % 공간. `amount` 는 그 분 거래대금(원, 없으면 0). */
export interface ViewCandle {
    x: number;
    o: number;
    h: number;
    l: number;
    c: number;
    amount: number;
    /**
     * **고가 등락률**(직전 거래일 종가 대비 %) — 일봉 전용. 일봉 차트 패널의 봉 위 마커와 같은 값이라
     * 같은 색·같은 숫자가 두 화면에서 나온다. 직전 봉이 없거나(창 첫날) 그 종가가 가격이 아니면 없다.
     * 분봉엔 안 붙는다 — 거기 마커는 거래대금 구간이 진다(분당 대금이 그 화면의 관심사다).
     */
    highPct?: number;
}

/** 원주가 분봉 하나 — `/chart` 번들의 MinuteCandle 중 이 모듈이 쓰는 부분(UN 한 벌). */
export interface RawMinute {
    time: string; // HH:MM:SS
    un: { open: string; high: string; low: string; close: string; volume: string };
}


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
            x: minutesOfDay(b.time) - origin.baseT,
            o: y(o), h: y(h), l: y(l), c: y(c),
            amount: Number.isFinite(amount) ? amount : 0,
        });
    }
    return out;
}

/** 일봉 하나 — `/chart` 번들의 DailyCandle 중 이 모듈이 쓰는 부분(시장 두 벌). */
export interface RawDaily {
    krx: { open: string; high: string; low: string; close: string; amount: string };
    un: { open: string; high: string; low: string; close: string; amount: string };
}

/**
 * 일봉 캔들 — 일봉 골격 뒤에 깔 배경. 분봉과 **x 규칙만 다르다**: 일봉 피벗의 t 는 벽시계가 아니라
 * **창 안 거래일 순번**(서버 resolveDailySkeletons 의 dayIndex)이라, 배열 인덱스가 곧 t 다.
 *
 * 그 인덱스가 클라에서도 맞는 이유: `/chart` 번들의 일봉과 골격 리졸버가 **같은 창**(`chartDailyRange`
 * = 차트 날짜 기준 2년)을 같은 수정주가 테이블에서 읽는다. 창이 같으니 순번도 같다 — 두 곳이 갈리면
 * 캔들이 통째로 옆으로 밀리므로, 이 전제가 이 함수의 유일한 위험이다.
 *
 * 시장은 **앵커 피벗이 앉는 쪽**으로 고른다: 골격 피벗은 사람이 지목한 시장에서 읽힌 값이라(KRX/UN),
 * 다른 쪽 캔들을 깔면 피벗 점이 자기 봉 밖에 뜬다. 기준 가격이 그 날 봉의 고저 안에 드는 쪽을 쓰되
 * 둘 다 되면 UN(통합)을 쓴다.
 */
export function dailyOverlayCandles(
    bars: readonly RawDaily[],
    origin: { basePrice: number; baseT: number },
): ViewCandle[] {
    if (origin.basePrice <= 0 || bars.length === 0) return [];
    const at = bars[origin.baseT];
    const holds = (b: { high: string; low: string } | undefined): boolean => {
        if (!b) return false;
        const h = priceOf(b.high);
        const l = priceOf(b.low);
        return Number.isFinite(h) && Number.isFinite(l) && origin.basePrice >= l && origin.basePrice <= h;
    };
    const market: "krx" | "un" = holds(at?.un) || !holds(at?.krx) ? "un" : "krx";
    const y = (price: number): number => pct(price, origin.basePrice);
    const out: ViewCandle[] = [];
    for (let i = 0; i < bars.length; i++) {
        const b = bars[i][market];
        const o = priceOf(b.open);
        const h = priceOf(b.high);
        const l = priceOf(b.low);
        const c = priceOf(b.close);
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
        // 일봉은 거래대금이 **실측**이라(소스 그대로) 분봉처럼 OHLC×량으로 지어내지 않는다.
        const amount = Number(b.amount);
        // 고가 등락률 — **배열의 직전 봉** 종가 대비(거래일이 곧 이웃이라 달력 공백은 문제가 안 된다).
        // 창 첫날은 끌어올 직전 봉이 없어 없음 — 지어내면 그 하루만 엉뚱한 마커가 선다.
        const prev = i > 0 ? priceOf(bars[i - 1][market].close) : NaN;
        const highPct = Number.isFinite(prev) ? ((h - prev) / prev) * 100 : undefined;
        out.push({
            x: i - origin.baseT, o: y(o), h: y(h), l: y(l), c: y(c),
            amount: Number.isFinite(amount) ? amount : 0,
            ...(highPct === undefined ? {} : { highPct }),
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
 * 빠진 분은 **직전 종가 평탄봉**(O=H=L=C=직전 종가, 거래대금 0)으로 채운다(사용자 확정).
 * 다만 채우는 건 **내부 갭만** — 선두 갭은 끌어올 값이 없어서, **후미 갭(마지막 봉 이후)은 장이 끝난 뒤라서**
 * 안 채운다(안 그러면 20시 이후까지 평탄봉이 줄줄이 선다 — memberPath 와 같은 경계).
 */
export function memberCandles(
    from: number,
    to: number,
    series: MinuteOhlcSeries,
    origin: { baseRate: number; baseT: number },
): ViewCandle[] {
    const out: ViewCandle[] = [];
    // 채움은 **다음 실제 봉이 나올 때만** 확정된다 — 마지막 봉 뒤의 채움은 버려진다.
    const pending: ViewCandle[] = [];
    let prevClose: number | null = null;
    for (let m = from; m <= to; m++) {
        const i = series.index.get(m);
        const x = m - origin.baseT;
        if (i == null) {
            if (prevClose === null) continue; // 선두 갭 — 지어낼 직전 값이 없다
            pending.push({ x, o: prevClose, h: prevClose, l: prevClose, c: prevClose, amount: 0 });
            continue;
        }
        const o = series.open[i];
        const h = series.high[i];
        const l = series.low[i];
        const c = series.close[i];
        if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
        if (pending.length > 0) { out.push(...pending); pending.length = 0; }
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
 * **하한 0.6px — 축소해도 사라지지 않는다**(사용자 확정): 예전엔 몸통이 1.5px 아래면 캔들을 통째로
 * 접었는데, 폭 하나 때문에 보던 그림이 사라지는 게 더 불편했다. 좁아지면 잉크가 뭉치는 건 맞지만
 * 그건 "여기 봉이 빽빽하다"는 참인 그림이고, 확대하면 즉시 풀린다.
 */
export const CANDLE_MIN_WIDTH = 0.6;
export const candleWidth = (pxPerMinute: number): number => Math.min(9, Math.max(CANDLE_MIN_WIDTH, pxPerMinute * 0.7));
