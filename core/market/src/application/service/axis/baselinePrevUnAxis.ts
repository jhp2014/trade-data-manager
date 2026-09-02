// 계산 축 — "기준선 % (UN)": 그날 기준가(전일 UN 종가)에서 기준선까지 몇 % 위(아래)에 있나.
//
//   값 = (기준선 가격 − 그날 기준가) / 그날 기준가 × 100   (기준선이 위면 +)
//
// 뜻: 오늘 시작점에서 그 저항선까지의 거리. 매물 공백(왼쪽이 얼마나 비었나)·기준선 거리(얼마나 묵었나)와
// 달리 이 축은 **높이**를 잰다 — 같은 앵커를 세 번째 뜻으로 읽는 축이다.
//
// 분모는 차트 D 가격선과 같은 것(basePricesOf = 원주가 직전종가 × 이벤트 보정계수) — prevDayHighAxis 가
// 분모를 차트와 맞춘 이유가 그대로다(축의 유일한 초기 검증 수단 = 차트 열어 눈으로 대조).
//
// ⚠ 스케일: 분자·분모가 서로 다른 자에 있다 — 리졸버 승자(baselineAnchorAdjustedPrice)는 **수정주가 자**,
//   basePricesOf 는 **그 날 원주가 자**다. 승자 값에 그 날 환산비(rawScaleOf)를 **곱해** 원주가로 되돌려
//   나눈다 — 격자 굽기(pointGrids.bake)와 같은 방향이다. supplyGapAxis 는 반대 방향(스캔 자체가 수정주가)
//   이라 그쪽을 베끼면 감자·액분 종목에서 배율만큼 틀어진다.
//
// grain 이 day 인 이유: 재료가 앵커(과거 캔들)와 전일까지의 일봉뿐 — 당일 데이터가 값에 한 톨도 안 들어간다.
//
// 결손(값을 지어내지 않는다, 규칙 3):
//  · 기준선 없음(입력 전)·후보 다중 확정 불가 — 리졸버 규칙 그대로.
//  · 앵커 캔들 미수집/값 없음.
//  · 그날 기준가 없음 — 상장 첫날·직전 거래일이 창(1개월) 밖(장기 거래정지).
import { BASELINE_PARAM, basePricesOf, chartKeyOf, rawScaleOf, type ChartRef } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { subtractMonths } from "../shared/dailyRange.js";
import { baselineAnchorAdjustedPrice, resolveBaselines } from "../shared/baselineResolver.js";
import { dropSameDayAnchors, type AxisDeps, type DayAxisValue, type DayComputedAxisDef } from "./axis.js";

/** 그날 기준가 조회 창 — 직전 거래일 하나면 충분하고 연휴·거래정지를 덮는 여유(pointGrids.bake 와 같은 창).
 *  ⚠ 하루로 좁히면 basePricesOf 가 언제나 null 을 낸다(직전 거래일이 창 밖). */
const BASE_LOOKBACK_MONTHS = 1;
/** (종목,날) 동시 읽기 상한 — 다른 축과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

export function baselinePrevUnAxis(): DayComputedAxisDef {
    return {
        key: "baseline-prev-un",
        name: "기준선 % (UN)",
        version: 1,
        strongerWhen: "higher", // 높이 있을수록 = 오늘 그 선까지 가는 것 자체가 큰 움직임
        grain: "day",
        inputs: ["minute", "rawDaily", "adjDaily"],
        params: [BASELINE_PARAM],
        compute: computeBaselinePrevUn,
    };
}

async function computeBaselinePrevUn(charts: readonly ChartRef[], deps: AxisDeps): Promise<DayAxisValue[]> {
    const anchors = await deps.chartAnchor.listAll();
    // day 알갱이 가드 — 다른 앵커 축들과 같은 후보 집합(당일 앵커 배제)을 봐야 같은 선을 잰다.
    const baselineOf = await resolveBaselines(charts, dropSameDayAnchors(anchors, BASELINE_PARAM), deps);
    const jobs = charts.flatMap((c) => {
        const anchor = baselineOf.get(chartKeyOf(c));
        return anchor ? [{ c, anchor }] : []; // 기준선 없음(입력 전)·확정 불가(결손)는 재료를 읽기 전에 빠진다
    });
    if (jobs.length === 0) return [];

    const per = await mapWithConcurrency(jobs, DAY_CONCURRENCY, async ({ c, anchor }): Promise<DayAxisValue[]> => {
        const range = { from: subtractMonths(c.date, BASE_LOOKBACK_MONTHS), to: c.date };
        const [rawDaily, adjDaily] = await Promise.all([
            deps.rawDaily.getRawDailyCandles(c.stockCode, range),
            deps.adjDaily.getDailyCandles(c.stockCode, range),
        ]);
        const prevBase = basePricesOf(rawDaily, adjDaily, c.date).base.un;
        if (prevBase === null || !(prevBase > 0)) return [];

        const adjusted = await baselineAnchorAdjustedPrice(anchor, deps);
        if (adjusted === null) return [];
        const baseline = adjusted * rawScaleOf(rawDaily, adjDaily, c.date); // 그 날 원주가 자로 — 분모와 같은 자

        const value = ((baseline - prevBase) / prevBase) * 100;
        if (!Number.isFinite(value)) return [];
        return [{ stockCode: c.stockCode, date: c.date, value }];
    });
    return per.flat();
}
