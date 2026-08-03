// 계산 축 — "매물 공백(일)": 기준선 가격 위가 비어 있던 구간이 앵커 캔들 왼쪽으로 몇 거래일인가.
//
//   값 = 앵커 캔들 **바로 왼쪽**부터 과거로 훑어 `그날 UN 고가 ≥ 기준선` 인 첫 캔들까지의 거래일 수.
//        바로 전 거래일이 이미 기준선 위였으면 0(공백 없음). 창 끝까지 접촉이 없으면 SATURATED(줄의 오른쪽 끝).
//
// 뜻: "오늘 이 선을 돌파하면 위에 매물이 있나". 선 위에서 거래된 마지막 날이 멀수록(=값이 클수록) 돌파 후
// 부딪힐 매물이 없다. 값이 포화면 그 창 안에서는 역사적 신고가다.
//
// **왼쪽만 본다**(앵커~타점 사이는 안 본다). 보통 선을 최고점에 긋기 때문에 그 구간은 정의상 기준선 아래다.
// "선의 나이"(공백의 숙성)는 이 축과 독립이라 재고 싶으면 별개 축이지 이 축의 옵션이 아니다.
//
// **시장 토글이 없다.** 기준선 값은 앵커가 시장·값까지 지목해 꺼내고(baselinePositionAxis 와 같은 규칙 —
// 시장은 값을 꺼내는 경로일 뿐), 왼쪽 스캔은 언제나 UN 이다. UN 고가는 NXT 가짜 체결로 튈 수 있고 max 스캔은
// 이상치 하나에 통째로 뒤집히지만, 처방은 시장을 KRX 로 바꾸는 게 아니라 **무시 캔들**이다 — KRX 고정은
// NXT 단독 고가를 놓치면서 놓쳤다는 걸 화면에서 볼 방법이 없고, 무시 목록은 반대로 실패가 눈에 띈다
// (가격선이 그어진 차트에서 선 위로 삐죽 나온 봉은 그냥 보인다 → 우클릭 해제 → 그 타점만 재계산).
//
// **창은 차트가 보여주는 범위**(타점 날짜 기준 2년, chartDailyRange)다. 창을 더 늘리면 값에 영향을 준 캔들이
// 화면 밖에 생겨 육안 검증이 불가능해진다 — 창 길이는 자유 노브가 아니라 차트 깊이에 묶인 값이다.
// 조회 상한이 타점 날짜라 규칙 2(타점 이후 정보 금지)도 질의 자체로 지켜진다.
//
// **포화는 하나의 값(SATURATED)이다.** 훑은 거래일 수를 그대로 쓰면 "창 전체가 비었다"는 같은 판단이 종목의
// 데이터 길이에 따라 다른 값이 되고, 왼쪽에 캔들이 아예 없는 타점(앵커가 창의 첫 봉)은 0 이 되어 "매물이 바로
// 옆에 있다"는 정반대 뜻으로 줄의 왼쪽 끝에 선다. 그래서 접촉이 없으면 길이와 무관하게 한 값 — 포화끼리는 동률.
// ⚠ 대가: 왼쪽 정보가 없는 타점(신규 상장·앵커가 창 왼쪽 끝)도 "가장 비었다"로 선다. 없다는 것과 모른다는 것을
//   같게 취급하는 선택이고, 화면에서 그 타점의 차트를 보면 바로 구분되므로 감수한다.
//
// 결손(축에서 빠짐): 기준선 앵커 없음 · 앵커 캔들이 창 밖이거나 미수집 · 기준값 0.
import { IGNORE_CANDLE_PARAM, type DailyCandle, type MinuteCandle, type PointAnchor, type ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { chartDailyRange } from "../shared/dailyRange.js";
import type { AxisDeps, ComputedAxisDef, ComputedAxisValue } from "./axis.js";

/** 기준선(분모가 아니라 여기선 문턱) 파라미터. */
const PARAM = "baseline";
/**
 * 접촉 없음 = 포화. 창(2년 ≈ 490 거래일)이 낼 수 있는 어떤 실제 공백보다 크게 잡아 **언제나 줄의 오른쪽 끝**에
 * 서게 한다. 레일 스케일이 뭉개지지 않도록 자릿수는 창 길이 언저리로 — 9999 같은 값이면 실제 값들이 왼쪽에 눌린다.
 */
export const SUPPLY_GAP_SATURATED = 500;
/** (종목,날) 동시 읽기 상한 — 다른 축과 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

/** 가격 앵커로 좁힌 타입 — field·market 쌍이 있어야 값을 꺼낼 수 있다(시각 앵커는 기준선이 될 수 없다). */
type PriceAnchor = PointAnchor & { field: NonNullable<PointAnchor["field"]>; market: NonNullable<PointAnchor["market"]> };

export function supplyGapAxis(): ComputedAxisDef {
    return {
        key: "supply-gap",
        name: "매물 공백(일)",
        version: 2, // v2: 무시 캔들을 공백 일수로 세고(접촉만 아님), 포화를 한 값(SUPPLY_GAP_SATURATED)으로 통일
        strongerWhen: "higher",
        display: { suffix: "일", decimals: 0, signed: false }, // 거래일 수 — 정수이고 부호가 뜻이 없다
        inputs: ["minute", "adjDaily"],
        params: [PARAM],
        optionalParams: [IGNORE_CANDLE_PARAM],
        compute: computeSupplyGap,
    };
}

const pk = (p: ReviewPointKey): string => `${p.stockCode}|${p.date}|${p.time}`;

async function computeSupplyGap(points: readonly ReviewPointKey[], deps: AxisDeps): Promise<ComputedAxisValue[]> {
    const anchors = await deps.pointAnchor.listAll();
    const baselineOf = new Map<string, PriceAnchor>();
    const ignoredOf = new Map<string, Set<string>>();
    for (const a of anchors) {
        if (a.param === PARAM) {
            if (a.field != null && a.market != null) baselineOf.set(pk(a), a as PriceAnchor);
        } else if (a.param === IGNORE_CANDLE_PARAM) {
            const set = ignoredOf.get(pk(a));
            if (set) set.add(a.anchorDate);
            else ignoredOf.set(pk(a), new Set([a.anchorDate]));
        }
    }
    const jobs = points.flatMap((p) => {
        const base = baselineOf.get(pk(p));
        return base ? [{ p, base }] : []; // 기준선 없는 타점은 재료를 읽기 전에 빠진다
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
    await mapWithConcurrency([...minuteKeys.values()], DAY_CONCURRENCY, async (d) => {
        minutesByDay.set(`${d.stockCode}|${d.date}`, await deps.minute.getMinuteCandles(d.stockCode, d.date));
    });

    const out: ComputedAxisValue[] = [];
    for (const { p, base } of jobs) {
        const daily = dailyByDay.get(`${p.stockCode}|${p.date}`) ?? [];
        const threshold = baselinePrice(base, daily, minutesByDay);
        if (threshold === null) continue;

        // 왼쪽 = 앵커보다 과거, 최신순. 무시 캔들과 UN 고가를 못 읽는 날은 **접촉이 아닐 뿐 날수로는 센다** —
        // 달력에서 지우는 게 아니라 "그날 거래는 없던 걸로 본다"는 뜻이라 공백의 길이는 그대로 흘러야 한다.
        const ignored = ignoredOf.get(pk(p));
        const left = daily.filter((c) => c.date < base.anchorDate).sort((a, b) => (a.date < b.date ? 1 : -1));

        let gap = SUPPLY_GAP_SATURATED; // 접촉 없음(왼쪽이 아예 없는 경우 포함) = 포화
        for (let i = 0; i < left.length; i++) {
            const c = left[i];
            if (ignored?.has(c.date)) continue;
            const high = Number(c.un?.high);
            if (Number.isFinite(high) && high >= threshold) {
                gap = i;
                break;
            }
        }
        out.push({ stockCode: p.stockCode, date: p.date, time: p.time, value: gap });
    }
    return out;
}

/**
 * 기준선 값 — 앵커가 지목한 캔들의 그 시장·그 값. 일봉 앵커는 이미 읽어둔 창에서 찾는다(창 밖 앵커는 결손:
 * 화면 밖 캔들이라 어차피 육안 검증도 안 된다), 분봉 앵커는 그 날 분봉에서.
 */
function baselinePrice(a: PriceAnchor, daily: DailyCandle[], minutesByDay: Map<string, MinuteCandle[]>): number | null {
    const raw = a.anchorTime ? pickMinute(a, minutesByDay) : daily.find((c) => c.date === a.anchorDate)?.[a.market]?.[a.field];
    if (raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
}

function pickMinute(a: PriceAnchor, minutesByDay: Map<string, MinuteCandle[]>): string | undefined {
    const bar = minutesByDay.get(`${a.stockCode}|${a.anchorDate}`)?.find((c) => c.time === a.anchorTime);
    return (a.market === "krx" ? bar?.krx : bar?.un)?.[a.field];
}
