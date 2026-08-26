// 계산 축 — "전일 고가 %": 그 하루가 시작하기 **전날**, 장중 최대 상승폭이 얼마였나.
//
//   값 = (전일 고가 − 전전일 종가) / 전전일 종가 × 100
//
// 뜻: 오늘을 보기 전에 "어제가 어떤 하루였나"를 한 숫자로. 절대가격(고가 그 자체)은 종목 간 비교가 안 되므로
// 반드시 % 로 잰다 — 축은 줄을 세우는 물건이고, 줄이 서려면 단위가 종목 독립이어야 한다.
//
// **분모는 차트 D 가격선과 같은 것**(basePricesOf = 원주가 직전종가 × 이벤트 보정계수)이다. dailyChangeAxis 가
// 분모를 차트와 맞춘 이유가 그대로 여기에도 있다: 계산 축의 유일한 초기 검증 수단이 "차트를 열어 눈으로 대조"라,
// 분모가 어긋나면 축이 맞는지 틀린지 확인할 방법 자체가 사라진다. 감자·액분 날 % 가 폭주하지 않는 것도 그 덕이다.
//
// grain 이 day 인 이유: 재료가 **전일까지의 일봉뿐**이다. 당일 데이터가 값에 한 톨도 안 들어가므로
// axis.ts 규칙 2(그 하루가 시작하기 전까지만)를 타입으로 지킬 수 있다 — compute 가 시각을 아예 못 받는다.
// params 도 없다: 사람 입력(앵커)과 무관하게 재료가 시장 데이터로 완결된다.
//   ⚠ 그래서 이 축의 캐시 항목은 지문이 빈 문자열이라 **영구 히트**한다(apps/api computedAxes 주석 참조).
//     계산식이나 재료(원주가 재작성)가 바뀌면 자동 무효화가 없다 — version 을 올리는 것이 유일한 처방이다.
//
// 결손(값을 지어내지 않는다, 규칙 3):
//  · 직전 거래일이 조회 창 밖 — 장기 거래정지. 창을 넓혀 억지로 값을 내지 않는다("너무 먼 전일"은 뜻이 없다).
//  · 그 전일의 기준가(전전일 종가) 없음 — 상장 첫날 등.
//  · **그 시장의 고가가 0** — 일봉 매퍼는 분봉과 달리 KRX 바를 null 로 주지 않고 0 으로 채운다.
//    그대로 계산하면 −100% 라는 가짜 값이 나온다. dailyChangeAxis 는 분봉 `krx === null` 로 저절로 걸러졌던
//    자리라 거기 코드를 베끼면 이 구멍이 열린다.
import { basePricesOf, computeChangeRate, type ChartRef, type DailyCandle } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { subtractMonths } from "../shared/dailyRange.js";
import type { AxisDeps, AxisMarket, DayAxisValue, DayComputedAxisDef } from "./axis.js";

/**
 * 조회 창 — 직전 거래일 하나와 **그 전날**(기준가)까지 두 봉이면 충분하지만, 연휴·거래정지를 넉넉히 덮는다.
 * 이 창을 벗어난 전일은 결손이다(위 주석).
 */
const LOOKBACK_MONTHS = 2;
/** (종목,날) 동시 읽기 상한 — 다른 축과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

/**
 * 전일 고가 % 축 팩토리. 시장별로 **별개 축**을 만든다(축 안 토글 금지 — axis.ts).
 * dailyChangeAxis 와 달리 KRX 판을 실제로 만드는 이유는 registry.ts 주석 참조.
 */
export function prevDayHighAxis(market: AxisMarket): DayComputedAxisDef {
    return {
        key: `prev-high-${market}`,
        name: `전일 고가 % (${market.toUpperCase()})`,
        version: 1,
        strongerWhen: "higher",
        grain: "day",
        inputs: ["rawDaily", "adjDaily"],
        compute: (charts, deps) => computePrevDayHigh(market, charts, deps),
    };
}

async function computePrevDayHigh(
    market: AxisMarket,
    charts: readonly ChartRef[],
    deps: AxisDeps,
): Promise<DayAxisValue[]> {
    const per = await mapWithConcurrency(charts, DAY_CONCURRENCY, async (c): Promise<DayAxisValue[]> => {
        const range = { from: subtractMonths(c.date, LOOKBACK_MONTHS), to: c.date };
        const [rawDaily, adjDaily] = await Promise.all([
            deps.rawDaily.getRawDailyCandles(c.stockCode, range),
            deps.adjDaily.getDailyCandles(c.stockCode, range),
        ]);

        const prev = lastBefore(rawDaily, c.date);
        if (prev === null) return []; // 전일 없음 — 창 밖이거나 상장 첫날

        // 고가는 **원주가**로 읽는다(분모도 원주가 기준으로 보정된 값이라 같은 스케일). 수정주가로 읽으면
        // 분자만 오늘 시점 스케일이 되어 감자·액분 날의 % 가 통째로 어긋난다.
        const high = Number(prev[market].high);
        if (!(high > 0)) return []; // 그 시장 세션 없음·거래정지(일봉은 0 으로 온다) — 위 ⚠

        // 전일의 기준가 = 전전일 종가(이벤트 보정 포함). 차트가 그날 그리는 D 선과 같은 값.
        const base = basePricesOf(rawDaily, adjDaily, prev.date).base[market];
        if (base === null || !(base > 0)) return [];

        const rate = computeChangeRate(String(high), String(base));
        if (rate === null) return [];
        const value = Number(rate);
        if (!Number.isFinite(value)) return [];
        return [{ stockCode: c.stockCode, date: c.date, value }];
    });
    return per.flat();
}

/** date 보다 작은 마지막 캔들(배열 순서를 가정하지 않는다 — 당일 봉 미적재여도 안전). 없으면 null. */
function lastBefore(candles: readonly DailyCandle[], date: string): DailyCandle | null {
    return candles.reduce<DailyCandle | null>((p, c) => (c.date < date && (p === null || c.date > p.date) ? c : p), null);
}
