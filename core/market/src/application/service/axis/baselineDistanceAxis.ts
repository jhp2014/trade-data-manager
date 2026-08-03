// 계산 축 — "기준선 거리(일)": 기준선 앵커 캔들에서 타점 날까지 몇 거래일이 흘렀나.
//
//   값 = 앵커 캔들 **다음** 거래일부터 타점 날까지의 거래일 수. 같은 날(분봉 앵커 등)이면 0.
//
// 뜻: 그 선이 얼마나 묵은 것인가. 매물 공백 축과 **앵커를 사이에 두고 반대쪽**을 잰다 —
// 공백은 앵커에서 왼쪽(과거)이 얼마나 비었나, 이 축은 앵커에서 오른쪽(타점까지)이 얼마나 흘렀나.
// 둘이 원리적으로 독립이라 같이 보면 "그 선이 언제 생겨서 그동안 아무도 안 건드렸나"가 통째로 읽힌다.
// (상관이 높아 안 만든 축 `dailyChangeAxis("krx")` 의 정반대 케이스 — 축을 늘릴 값어치가 여기 있다.)
//
// **앵커에서 좌표만 쓴다.** 같은 baseline 앵커를 소비하지만 기준선 대비 %·매물 공백이 *가격*을 꺼내는 것과
// 달리 여긴 날짜만 본다 — field·market 을 안 읽으므로 앵커 캔들 값이 미수집이어도 셀 수만 있으면 값이 나온다.
//
// 거래일로 센다(달력일 아님). 데이터에 있는 단위이고, 매물 공백 축과 단위가 같아 나란히 읽힌다.
//
// 무시 캔들은 이 축에 영향이 없다 — 무시는 "그날 거래는 없던 걸로 본다"지 달력에서 지우는 게 아니다
// (매물 공백이 무시 캔들을 공백 일수로 세는 것과 같은 논리). 그래서 optionalParams 도 없다.
//
// 우측 절단(saturated): 앵커가 창(2년)보다 이르면 그 사이 거래일을 셀 수 없다 → 값은 창 안 거래일 수 = 하한.
// 결손: 기준선 앵커 없음 · 타점 날 일봉 미수집(셀 자가 없다) · **앵커가 타점보다 미래**(검색날짜 드리프트로
//   잘못 찍은 입력. 음수를 조용히 내면 정렬이 이상해지고 원인을 못 짚는다 — 규칙 2를 어기는 입력이기도 하다).
import type { DailyCandle, PointAnchor, ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { chartDailyRange } from "../shared/dailyRange.js";
import type { AxisDeps, ComputedAxisDef, ComputedAxisValue } from "./axis.js";

/** 좌표만 빌려 쓰는 파라미터 — 가격은 안 읽는다. */
const PARAM = "baseline";
/** (종목,날) 동시 읽기 상한 — 다른 축과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

export function baselineDistanceAxis(): ComputedAxisDef {
    return {
        key: "baseline-distance",
        name: "기준선 거리(일)",
        version: 1,
        strongerWhen: "higher", // 멀수록 = 오래 묵은 저항을 깨는 자리
        display: { suffix: "일", decimals: 0, signed: false },
        inputs: ["adjDaily"],
        params: [PARAM],
        compute: computeBaselineDistance,
    };
}

const pk = (p: ReviewPointKey): string => `${p.stockCode}|${p.date}|${p.time}`;

async function computeBaselineDistance(points: readonly ReviewPointKey[], deps: AxisDeps): Promise<ComputedAxisValue[]> {
    const anchors = await deps.pointAnchor.listAll();
    const baselineOf = new Map<string, PointAnchor>();
    for (const a of anchors) if (a.param === PARAM) baselineOf.set(pk(a), a);
    const jobs = points.flatMap((p) => {
        const base = baselineOf.get(pk(p));
        return base ? [{ p, base }] : []; // 기준선 없는 타점은 재료를 읽기 전에 빠진다
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

    const out: ComputedAxisValue[] = [];
    for (const { p, base } of jobs) {
        if (base.anchorDate > p.date) continue; // 미래 앵커 — 이 축이 답할 수 있는 입력이 아니다
        const rows = dailyByDay.get(`${p.stockCode}|${p.date}`) ?? [];
        if (rows.length === 0 || rows[rows.length - 1].date !== p.date) continue; // 타점 날 일봉 미수집

        // 앵커 캔들 자체를 찾지 않고 "그 뒤 거래일"을 센다 — 앵커 날에 봉이 없어도(거래정지) 정의가 성립한다.
        const value = rows.filter((c) => c.date > base.anchorDate).length;
        // 앵커가 가진 일봉보다 이르면 그 사이를 못 센다 → 값은 하한.
        const saturated = base.anchorDate < rows[0].date;
        out.push({ stockCode: p.stockCode, date: p.date, time: p.time, value, ...(saturated ? { saturated: true } : {}) });
    }
    return out;
}
