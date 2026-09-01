// 계산 축 — "매물 공백(일)": 기준선 가격 위가 비어 있던 구간이 앵커 캔들 왼쪽으로 몇 거래일인가.
//
//   값 = 앵커 캔들 **바로 왼쪽**부터 과거로 훑어 `그날 UN 고가 ≥ 기준선` 인 첫 캔들까지의 거래일 수.
//        바로 전 거래일이 이미 기준선 위였으면 0(공백 없음). 창 끝까지 접촉이 없으면 saturated(줄의 오른쪽 끝).
//
// 뜻: "오늘 이 선을 돌파하면 위에 매물이 있나". 선 위에서 거래된 마지막 날이 멀수록(=값이 클수록) 돌파 후
// 부딪힐 매물이 없다. 값이 포화면 그 창 안에서는 역사적 신고가다.
//
// **왼쪽만 본다**(앵커~타점 사이는 안 본다). 보통 선을 최고점에 긋기 때문에 그 구간은 정의상 기준선 아래다.
// "선의 나이"(공백의 숙성)는 이 축과 독립이라 재고 싶으면 별개 축이지 이 축의 옵션이 아니다.
//
// **기준선은 리졸버가 고른다**(선=앵커 통합 후 다중, 규칙=가격 최저): shared/baselineResolver — 세 축이 같은
// 리졸버를 봐서 서로 다른 선을 재는 일이 없다. 문턱값은 이 축이 자기 창(이미 읽는 일봉)에서 다시 꺼낸다.
//
// **시장 토글이 없다.** 기준선 값은 앵커가 시장·값까지 지목해 꺼내고, 왼쪽 스캔은 언제나 UN 이다. UN 고가는
// NXT 가짜 체결로 튈 수 있고 max 스캔은 이상치 하나에 통째로 뒤집히지만, 처방은 시장을 KRX 로 바꾸는 게 아니라
// **무시 캔들**이다 — 무시 목록은 실패가 눈에 띈다(선 위로 삐죽 나온 봉은 그냥 보인다 → 우클릭 해제 → 재계산).
// 무시 캔들은 **차트(종목,날짜) 소유** — 그 차트의 모든 타점에 같은 판정이 적용되고, 다른 날짜 복기에는 안 샌다
// (전역이면 오늘 표시 하나가 과거 축 값을 소급해 흔든다 — 손배치의 근거가 움직이면 안 된다).
//
// **문턱과 스캔은 같은 스케일**(수정주가)이다. 왼쪽 스캔이 수정주가 일봉이라 문턱도 거기 맞춘다 —
// 일봉 앵커는 이미 수정주가고, 분봉 앵커(원주가)만 그 날 환산비(rawScaleOf)로 올려서 넣는다. 안 그러면
// 감자·액분이 낀 종목에서 문턱이 배율만큼 어긋나 공백이 0 또는 포화로 통째로 뒤집힌다.
//
// **창은 차트가 보여주는 범위**(타점 날짜 기준 2년, chartDailyRange)다. 창을 더 늘리면 값에 영향을 준 캔들이
// 화면 밖에 생겨 육안 검증이 불가능해진다 — 창 길이는 자유 노브가 아니라 차트 깊이에 묶인 값이다.
// 조회 상한이 타점 날짜라 규칙 2(타점 이후 정보 금지)도 질의 자체로 지켜진다.
//
// **접촉을 못 찾은 건 "아주 긴 공백"이 아니라 다른 종류다**(우측 절단). 값은 훑은 거래일 수 = 하한이고
// `saturated` 로 표시만 한다 — 줄에서의 자리(실측 최대 다음 칸)와 표기(∞)는 모집단을 아는 클라의 몫이다.
// ⚠ 대가: 왼쪽 정보가 없는 타점(신규 상장·앵커가 창 왼쪽 끝)도 "가장 비었다"로 선다. 없다는 것과 모른다는 것을
//   같게 취급하는 선택이고, 화면에서 그 타점의 차트를 보면 바로 구분되므로 감수한다.
//
// 결손(축에서 빠짐): 기준선 없음/확정불가 · 앵커 캔들이 창 밖이거나 미수집 · 기준값 0.
import { BASELINE_PARAM, candlePrice, chartKeyOf, IGNORE_CANDLE_PARAM, rawScaleOf, type ChartRef, type DailyCandle, type MinuteCandle } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { chartDailyRange } from "../shared/dailyRange.js";
import { resolveBaselines, type BaselineAnchor } from "../shared/baselineResolver.js";
import { dropSameDayAnchors, type AxisDeps, type DayAxisValue, type DayComputedAxisDef } from "./axis.js";

/** (종목,날) 동시 읽기 상한 — 다른 축과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

export function supplyGapAxis(): DayComputedAxisDef {
    return {
        key: "supply-gap",
        name: "매물 공백(일)",
        version: 6, // v6: 문턱(분봉 앵커)을 수정주가 스케일로 환산 — 스캔과 자를 맞춘다
        strongerWhen: "higher",
        // 값 = 앵커 왼쪽(과거 일봉)만 — 행 = 차트(종목,날짜). 타점이 없어도 기준선만 있으면 값이 나온다.
        // 당일 캔들에 그은 기준선은 compute 가 거른다(dropSameDayAnchors — 당일 가격이 문턱이 되면 미래).
        grain: "day",
        display: { suffix: "일", decimals: 0, signed: false }, // 거래일 수 — 정수이고 부호가 뜻이 없다
        inputs: ["minute", "rawDaily", "adjDaily"],
        params: [BASELINE_PARAM],
        optionalParams: [IGNORE_CANDLE_PARAM],
        compute: computeSupplyGap,
    };
}

async function computeSupplyGap(charts: readonly ChartRef[], deps: AxisDeps): Promise<DayAxisValue[]> {
    const anchors = await deps.chartAnchor.listAll();
    // day 알갱이 가드 — 당일 캔들에 그은 기준선은 그 값(당일 가격)이 문턱이 되어 이른 타점엔 미래다.
    // 무시 캔들(optionalParams)은 안 거른다: 그건 "그날 거래는 없던 걸로"라는 판정이지 가격 재료가 아니다.
    const baselineOf = await resolveBaselines(charts, dropSameDayAnchors(anchors, BASELINE_PARAM), deps);
    // 무시 캔들 — 차트키로 모은다(그 차트의 모든 타점이 같은 목록을 본다).
    const ignoredOf = new Map<string, Set<string>>();
    for (const a of anchors) {
        if (a.param !== IGNORE_CANDLE_PARAM) continue;
        const key = chartKeyOf(a);
        const set = ignoredOf.get(key);
        if (set) set.add(a.anchorDate);
        else ignoredOf.set(key, new Set([a.anchorDate]));
    }
    const jobs = charts.flatMap((p) => {
        const base = baselineOf.get(chartKeyOf(p));
        return base ? [{ p, base }] : []; // 기준선 없음(입력 전)·확정 불가(결손)는 재료를 읽기 전에 빠진다
    });
    if (jobs.length === 0) return [];

    // 일봉 — (종목, 타점날) 당 1회. 창은 그 타점 차트가 보여주는 범위 그대로(상한 = 타점 날짜).
    const dailyKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { p } of jobs) dailyKeys.set(`${p.stockCode}|${p.date}`, { stockCode: p.stockCode, date: p.date });
    const dailyByDay = new Map<string, DailyCandle[]>();
    await mapWithConcurrency([...dailyKeys.values()], DAY_CONCURRENCY, async (d) => {
        const rows = await deps.adjDaily.getDailyCandles(d.stockCode, { from: chartDailyRange(d.date).from, to: d.date });
        dailyByDay.set(`${d.stockCode}|${d.date}`, rows);
    });

    // 분봉 — 분봉 앵커를 쓴 타점만, (종목, 앵커날) 당 1회. 기준선을 분봉에 찍는 건 드물어 보통 이 읽기가 없다.
    const minuteKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { base } of jobs) if (base.anchorTime) minuteKeys.set(`${base.stockCode}|${base.anchorDate}`, { stockCode: base.stockCode, date: base.anchorDate });
    const minutesByDay = new Map<string, MinuteCandle[]>();
    // 분봉 앵커 값은 원주가라 그 날 환산비도 함께 읽는다(수정주가 스캔과 같은 자에 놓기 위해).
    const scaleByDay = new Map<string, number>();
    await mapWithConcurrency([...minuteKeys.values()], DAY_CONCURRENCY, async (d) => {
        const range = { from: d.date, to: d.date };
        const [minutes, raw, adj] = await Promise.all([
            deps.minute.getMinuteCandles(d.stockCode, d.date),
            deps.rawDaily.getRawDailyCandles(d.stockCode, range),
            deps.adjDaily.getDailyCandles(d.stockCode, range),
        ]);
        minutesByDay.set(`${d.stockCode}|${d.date}`, minutes);
        scaleByDay.set(`${d.stockCode}|${d.date}`, rawScaleOf(raw, adj, d.date));
    });

    const out: DayAxisValue[] = [];
    for (const { p, base } of jobs) {
        const daily = dailyByDay.get(`${p.stockCode}|${p.date}`) ?? [];
        const threshold = baselinePrice(base, daily, minutesByDay, scaleByDay);
        if (threshold === null) continue;

        // 왼쪽 = 앵커보다 과거, 최신순. 무시 캔들과 UN 고가를 못 읽는 날은 **접촉이 아닐 뿐 날수로는 센다** —
        // 달력에서 지우는 게 아니라 "그날 거래는 없던 걸로 본다"는 뜻이라 공백의 길이는 그대로 흘러야 한다.
        const ignored = ignoredOf.get(chartKeyOf(p));
        const left = daily.filter((c) => c.date < base.anchorDate).sort((a, b) => (a.date < b.date ? 1 : -1));

        // 접촉을 못 찾으면 값은 훑은 거래일 수 = **하한**("적어도 이만큼 비었다")이고 saturated 로 표시한다.
        // 그 자리는 줄의 실측 최대 다음 칸 — 창 길이가 종목마다 달라도 포화끼리는 같은 칸에 선다.
        let gap = left.length;
        let saturated = true;
        for (let i = 0; i < left.length; i++) {
            const c = left[i];
            if (ignored?.has(c.date)) continue;
            const high = Number(c.un?.high);
            if (Number.isFinite(high) && high >= threshold) {
                gap = i;
                saturated = false;
                break;
            }
        }
        out.push({ stockCode: p.stockCode, date: p.date, value: gap, ...(saturated ? { saturated: true } : {}) });
    }
    return out;
}

/**
 * 기준선 값(문턱) — 앵커가 지목한 캔들의 그 시장·그 값을 **수정주가 스케일로**. 일봉 앵커는 이미 읽어둔 창에서
 * 찾고(창 밖 앵커는 결손: 화면 밖 캔들이라 어차피 육안 검증도 안 된다), 분봉 앵커는 그 날 분봉에서 꺼내
 * 그 날 환산비로 올린다.
 */
function baselinePrice(
    a: BaselineAnchor,
    daily: DailyCandle[],
    minutesByDay: Map<string, MinuteCandle[]>,
    scaleByDay: Map<string, number>,
): number | null {
    if (!a.anchorTime) return candlePrice(daily.find((c) => c.date === a.anchorDate)?.[a.market]?.[a.field]);
    const price = candlePrice(pickMinute(a, minutesByDay)); // 값 해석(미수집/0/비수치=null)은 도메인 규칙 한 곳
    if (price === null) return null;
    const scale = scaleByDay.get(`${a.stockCode}|${a.anchorDate}`) ?? 1;
    return scale > 0 ? price / scale : price;
}

function pickMinute(a: BaselineAnchor, minutesByDay: Map<string, MinuteCandle[]>): string | undefined {
    const bar = minutesByDay.get(`${a.stockCode}|${a.anchorDate}`)?.find((c) => c.time === a.anchorTime);
    return (a.market === "krx" ? bar?.krx : bar?.un)?.[a.field];
}
