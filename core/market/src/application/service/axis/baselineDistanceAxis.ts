// 계산 축 — "기준선 거리(일)": 기준선 앵커 캔들에서 타점 날까지 몇 거래일이 흘렀나.
//
//   값 = 앵커 캔들 **다음** 거래일부터 타점 날까지의 거래일 수. 당일 앵커는 결손(day 절단선 — 아래 grain 주석).
//
// 뜻: 그 선이 얼마나 묵은 것인가. 매물 공백 축과 **앵커를 사이에 두고 반대쪽**을 잰다 —
// 공백은 앵커에서 왼쪽(과거)이 얼마나 비었나, 이 축은 앵커에서 오른쪽(타점까지)이 얼마나 흘렀나.
// 둘이 원리적으로 독립이라 같이 보면 "그 선이 언제 생겨서 그동안 아무도 안 건드렸나"가 통째로 읽힌다.
//
// **기준선은 리졸버가 고른다**(선=앵커 통합 후 다중): shared/baselineResolver — 후보 1개면 가격을 안 읽으므로
// 이 축의 견고성(앵커 캔들 값이 미수집이어도 셀 수만 있으면 값이 나온다)은 흔한 경우에 그대로 보존되고,
// 후보가 여럿일 때만 가격(최저 선택)이 개입한다. 세 축이 같은 리졸버를 봐서 서로 다른 선을 재는 일이 없다.
//
// 거래일로 센다(달력일 아님). 데이터에 있는 단위이고, 매물 공백 축과 단위가 같아 나란히 읽힌다.
//
// 무시 캔들은 이 축에 영향이 없다 — 무시는 "그날 거래는 없던 걸로 본다"지 달력에서 지우는 게 아니다
// (매물 공백이 무시 캔들을 공백 일수로 세는 것과 같은 논리). 그래서 optionalParams 도 없다.
//
// 우측 절단(saturated): 앵커가 창(2년)보다 이르면 그 사이 거래일을 셀 수 없다 → 값은 창 안 거래일 수 = 하한.
// 결손: 기준선 없음/확정불가 · 타점 날 일봉 미수집(셀 자가 없다) · **앵커가 타점보다 미래**(검색날짜 드리프트로
//   잘못 찍은 입력. 음수를 조용히 내면 정렬이 이상해지고 원인을 못 짚는다 — 규칙 2를 어기는 입력이기도 하다).
import { BASELINE_PARAM, chartKeyOf, type ChartRef, type DailyCandle } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { chartDailyRange } from "../shared/dailyRange.js";
import { resolveBaselines } from "../shared/baselineResolver.js";
import { dropSameDayAnchors, type AxisDeps, type DayAxisValue, type DayComputedAxisDef } from "./axis.js";

/** (종목,날) 동시 읽기 상한 — 다른 축과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

export function baselineDistanceAxis(): DayComputedAxisDef {
    return {
        key: "baseline-distance",
        name: "기준선 거리(일)",
        version: 4, // v4: 리졸버가 후보를 한 스케일(수정주가)에서 겨루게 — 고르는 선이 바뀔 수 있다
        strongerWhen: "higher", // 멀수록 = 오래 묵은 저항을 깨는 자리
        // 값 = 앵커→차트 날짜 거래일 수 — 행 = 차트(종목,날짜). 타점이 없어도 기준선만 있으면 값이 나온다.
        // 당일 앵커는 compute 가 거른다(dropSameDayAnchors). 이 축 단독으론 당일 앵커=0 이 무해해 보이지만,
        // 리졸버 후보가 축마다 다르면 세 축이 서로 다른 선을 재는 상태가 조용히 생긴다 — 공백 축과 같이 거른다.
        grain: "day",
        display: { suffix: "일", decimals: 0, signed: false },
        inputs: ["adjDaily"],
        params: [BASELINE_PARAM],
        compute: computeBaselineDistance,
    };
}

async function computeBaselineDistance(charts: readonly ChartRef[], deps: AxisDeps): Promise<DayAxisValue[]> {
    const anchors = await deps.chartAnchor.listAll();
    // day 알갱이 가드 — 공백 축과 같은 후보 집합을 봐야 한다(리졸버 규칙이 한 곳인 이유와 같은 이유).
    const baselineOf = await resolveBaselines(charts, dropSameDayAnchors(anchors, BASELINE_PARAM), deps);
    const jobs = charts.flatMap((p) => {
        const base = baselineOf.get(chartKeyOf(p));
        return base ? [{ p, base }] : []; // 기준선 없음(입력 전)·확정 불가(결손)는 재료를 읽기 전에 빠진다
    });
    if (jobs.length === 0) return [];

    // 일봉 — (종목, 타점날) 당 1회. 창은 그 타점 차트가 보여주는 범위(상한 = 타점 날짜 → 규칙 2가 질의로 지켜진다).
    const dailyKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { p } of jobs) dailyKeys.set(`${p.stockCode}|${p.date}`, { stockCode: p.stockCode, date: p.date });
    const dailyByDay = new Map<string, DailyCandle[]>();
    await mapWithConcurrency([...dailyKeys.values()], DAY_CONCURRENCY, async (d) => {
        const rows = await deps.adjDaily.getDailyCandles(d.stockCode, { from: chartDailyRange(d.date).from, to: d.date });
        dailyByDay.set(`${d.stockCode}|${d.date}`, rows);
    });

    const out: DayAxisValue[] = [];
    for (const { p, base } of jobs) {
        if (base.anchorDate > p.date) continue; // 미래 앵커 — 이 축이 답할 수 있는 입력이 아니다
        const rows = dailyByDay.get(`${p.stockCode}|${p.date}`) ?? [];
        if (rows.length === 0 || rows[rows.length - 1].date !== p.date) continue; // 타점 날 일봉 미수집

        // 앵커 캔들 자체를 찾지 않고 "그 뒤 거래일"을 센다 — 앵커 날에 봉이 없어도(거래정지) 정의가 성립한다.
        const value = rows.filter((c) => c.date > base.anchorDate).length;
        // 앵커가 가진 일봉보다 이르면 그 사이를 못 센다 → 값은 하한.
        const saturated = base.anchorDate < rows[0].date;
        out.push({ stockCode: p.stockCode, date: p.date, value, ...(saturated ? { saturated: true } : {}) });
    }
    return out;
}
