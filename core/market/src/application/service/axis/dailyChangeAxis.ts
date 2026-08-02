// 계산 축 — "당일 %": 타점 **그 시각**에 몇 % 올라 있었나.
//
// 분모(기준가)는 차트 D 가격선과 **같은 것**을 쓴다(basePricesOf = 원주가 직전종가 × 이벤트 보정계수).
// 여기가 어긋나면 "차트는 12%인데 축은 9%"가 되어 눈으로 하는 검증이 불가능해진다 — 계산 축의 유일한
// 초기 검증 수단이 그 대조라서, 분모 일치는 이 축의 정확도보다 중요하다.
//
// 시각 경계: 타점 시각 **이하**의 마지막 분봉 종가를 쓴다(그 분에 거래가 없으면 직전 바 = forward fill).
// 그날 종가·고가를 쓰지 않는 이유는 axis.ts 규칙 2 참조(그건 축이 아니라 outcome).
import { basePricesOf, computeChangeRate, type MinuteCandle } from "#domain";
import type { ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { subtractMonths } from "../shared/dailyRange.js";
import { groupByDay, type AxisDeps, type AxisMarket, type ComputedAxisDef, type ComputedAxisValue } from "./axis.js";

/** 기준가 조회 창 — basePricesOf 는 직전 거래일 하나만 있으면 되지만 연휴를 넉넉히 덮는다. */
const BASE_LOOKBACK_MONTHS = 1;
/** (종목,날) 동시 읽기 상한 — 타점 수백 건이면 그만큼의 날이 온다. 커넥션 풀 포화 방지. */
const DAY_CONCURRENCY = 8;

/**
 * 당일 % 축 팩토리. 시장별로 **별개 축**을 만든다 — 하나의 축에 토글을 다는 대신 축을 늘린다.
 * KRX 추가는 레지스트리에 `dailyChangeAxis("krx")` 한 줄이면 끝난다.
 */
export function dailyChangeAxis(market: AxisMarket): ComputedAxisDef {
    return {
        key: `daily-change-${market}`,
        name: `당일 % (${market.toUpperCase()})`,
        version: 1,
        strongerWhen: "higher",
        inputs: ["minute", "rawDaily", "adjDaily"],
        compute: (points, deps) => computeDailyChange(market, points, deps),
    };
}

async function computeDailyChange(
    market: AxisMarket,
    points: readonly ReviewPointKey[],
    deps: AxisDeps,
): Promise<ComputedAxisValue[]> {
    const days = groupByDay(points);
    const perDay = await mapWithConcurrency(days, DAY_CONCURRENCY, async (day): Promise<ComputedAxisValue[]> => {
        const range = { from: subtractMonths(day.date, BASE_LOOKBACK_MONTHS), to: day.date };
        const [minutes, rawDaily, adjDaily] = await Promise.all([
            deps.minute.getMinuteCandles(day.stockCode, day.date),
            deps.rawDaily.getRawDailyCandles(day.stockCode, range),
            deps.adjDaily.getDailyCandles(day.stockCode, range),
        ]);

        // 그 시장 바가 있는 분봉만. KRX 는 NXT 단독 시간대(프리마켓·시간외)에 구조적으로 부재 —
        // 그 시각의 타점은 KRX 축에서 결손이 맞다(0% 로 지어내지 않는다).
        const bars = minutes
            .filter((m) => barOf(m, market) !== null)
            .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
        if (bars.length === 0) return [];

        // 기준가 없음(상장 첫날 등) → 당일 첫 시가 폴백. deriveMinutes·차트와 같은 폴백이라 화면과 일치한다.
        const base = basePricesOf(rawDaily, adjDaily, day.date).base[market] ?? Number(barOf(bars[0], market)?.open);
        if (!Number.isFinite(base) || base === 0) return [];

        const out: ComputedAxisValue[] = [];
        for (const p of day.points) {
            const bar = lastBarAtOrBefore(bars, p.time, market);
            if (bar === null) continue; // 첫 분봉보다 이른 타점 → 결손
            const rate = computeChangeRate(bar.close, String(base));
            if (rate === null) continue;
            const value = Number(rate);
            if (!Number.isFinite(value)) continue;
            out.push({ stockCode: p.stockCode, date: p.date, time: p.time, value });
        }
        return out;
    });
    return perDay.flat();
}

/** 시장별 바 추출 — UN 은 항상 존재, KRX 는 세션이 없으면 null. */
function barOf(m: MinuteCandle, market: AxisMarket): { open: string; close: string } | null {
    return market === "un" ? m.un : m.krx;
}

/** 시각 이하의 마지막 바(= forward fill). 없으면 null. 배열은 시간 오름차순 전제. */
function lastBarAtOrBefore(bars: MinuteCandle[], time: string, market: AxisMarket): { open: string; close: string } | null {
    let found: { open: string; close: string } | null = null;
    for (const b of bars) {
        if (b.time > time) break;
        found = barOf(b, market);
    }
    return found;
}
