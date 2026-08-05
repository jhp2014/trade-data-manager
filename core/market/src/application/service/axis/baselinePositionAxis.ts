// 계산 축 — "기준선 대비 %": 타점 **그 시각**의 가격이 baseline 앵커 값 대비 몇 %인가.
//
//   값 = (타점 UN종가 − 기준선가격) / 기준선가격
//
// **전일 종가가 안 들어간다.** 그래서 "기준선에서 샀다면 지금 몇 %"와 같은 뜻이고, 여기엔 시장 선택이 개입할
// 자리가 없다 — 당일 % 축(분모가 전일 종가)과 갈리는 지점이다. KRX/UN 별개 축을 만들 이유도 없다.
//
// **기준선은 리졸버가 고른다**(선=앵커 통합 후 다중, 규칙=가격 최저): shared/baselineResolver — 세 축이 같은
// 리졸버를 봐서 서로 다른 선을 재는 일이 없다.
//
// **시장은 값을 꺼내는 경로일 뿐 값의 속성이 아니다.** 앵커의 market·field 는 기준선 값을 그 캔들의 어디서
// 꺼낼지만 말한다(오염된 UN 고가 회피 등). 꺼내고 나면 그냥 가격 하나이고, 그 뒤로 시장 개념은 사라진다.
// 그래서 분자는 **언제나 UN 종가**다 — 분봉은 늘 UN 전체를 본다는 화면 규칙과 같고, 예전처럼 분자를 앵커
// 시장에 묶었더니 KRX 앵커를 쓴 NXT 단독 시간대(프리마켓·시간외) 타점이 통째로 결손이 됐다.
//
// 결손(축에서 빠짐): 기준선 없음/확정불가 · 앵커 캔들 미로드/미수집 · 기준값 0 · 타점이 첫 분봉보다 이름.
// 전부 지어내지 않고 뺀다(axis.ts 규칙 3).
//
// 일봉 앵커는 **수정주가**에서 읽는다 — 차트 일봉 pane·선이 보는 그 값(최근 구간은 원주가와 같은 스케일이라
// 분봉 분자와 정합). 분봉 앵커는 raw 분봉 그대로.
//
// ⚠ 눈 대조 방법이 다른 축과 다르다. 차트 % 눈금은 전일종가 기준이라 화면의 %p 간격과 이 축 값은 분모가 다르다.
//   대조는 **가격 두 개**로: 차트의 기준선 가격과 타점 시각 가격을 읽어 직접 나눈다.
import { BASELINE_PARAM, candlePrice, chartKeyOf, computeChangeRate, type DailyCandle, type MinuteCandle, type ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { resolveBaselines } from "../shared/baselineResolver.js";
import type { AxisDeps, ComputedAxisDef, ComputedAxisValue } from "./axis.js";

/** (종목,날) 동시 읽기 상한 — dailyChangeAxis 와 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

export function baselinePositionAxis(): ComputedAxisDef {
    return {
        key: "baseline-position",
        name: "기준선 대비 %",
        version: 3, // v3: 앵커 소유가 타점 → 차트(종목,날짜)로, 다중 기준선은 리졸버(가격 최저)가 확정
        strongerWhen: "higher",
        inputs: ["minute", "adjDaily"],
        params: [BASELINE_PARAM],
        compute: computeBaselinePosition,
    };
}

async function computeBaselinePosition(points: readonly ReviewPointKey[], deps: AxisDeps): Promise<ComputedAxisValue[]> {
    const anchors = await deps.chartAnchor.listAll();
    const baselineOf = await resolveBaselines(points, anchors, deps);
    const jobs = points.flatMap((p) => {
        const a = baselineOf.get(chartKeyOf(p));
        return a ? [{ p, a }] : []; // 기준선 없음(입력 전)·확정 불가(결손)는 재료를 읽기 전에 빠진다
    });
    if (jobs.length === 0) return [];

    // 분봉 읽기 = 타점의 날 ∪ 분봉 앵커의 날(다른 날일 수 있음 — 검색날짜 드리프트로 찍은 앵커). 하루 1회.
    const minuteDayKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { p, a } of jobs) {
        minuteDayKeys.set(`${p.stockCode}|${p.date}`, { stockCode: p.stockCode, date: p.date });
        if (a.anchorTime) minuteDayKeys.set(`${a.stockCode}|${a.anchorDate}`, { stockCode: a.stockCode, date: a.anchorDate });
    }
    const minuteDays = [...minuteDayKeys.values()];
    const minutesByDay = new Map<string, MinuteCandle[]>();
    await mapWithConcurrency(minuteDays, DAY_CONCURRENCY, async (d) => {
        minutesByDay.set(`${d.stockCode}|${d.date}`, await deps.minute.getMinuteCandles(d.stockCode, d.date));
    });

    // 일봉 앵커 값 = 그 하루짜리 수정주가 조회(유니크 (종목,날짜)당 1회).
    const dailyKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { a } of jobs) if (!a.anchorTime) dailyKeys.set(`${a.stockCode}|${a.anchorDate}`, { stockCode: a.stockCode, date: a.anchorDate });
    const dailyByKey = new Map<string, DailyCandle | undefined>();
    await mapWithConcurrency([...dailyKeys.values()], DAY_CONCURRENCY, async (d) => {
        const rows = await deps.adjDaily.getDailyCandles(d.stockCode, { from: d.date, to: d.date });
        dailyByKey.set(`${d.stockCode}|${d.date}`, rows.find((r) => r.date === d.date));
    });

    const out: ComputedAxisValue[] = [];
    for (const { p, a } of jobs) {
        // 분모 — 앵커가 지목한 캔들의 저장된 시장·값.
        let baseline: string | undefined;
        if (a.anchorTime) {
            const m = minutesByDay.get(`${a.stockCode}|${a.anchorDate}`)?.find((c) => c.time === a.anchorTime);
            baseline = (a.market === "krx" ? m?.krx : m?.un)?.[a.field];
        } else {
            baseline = dailyByKey.get(`${a.stockCode}|${a.anchorDate}`)?.[a.market]?.[a.field];
        }
        if (baseline === undefined || candlePrice(baseline) === null) continue; // 앵커 캔들 미수집·0 — 결손(도메인 규칙 한 곳)

        // 분자 — 타점 시각 이하 마지막 분봉 종가(forward fill), **언제나 UN**(UN 바는 항상 존재 → 세션 결손 없음).
        const bars = minutesByDay.get(`${p.stockCode}|${p.date}`) ?? [];
        let close: string | undefined;
        for (const b of bars) {
            if (b.time > p.time) break;
            close = b.un.close;
        }
        if (close === undefined) continue;

        const rate = computeChangeRate(close, baseline);
        if (rate === null) continue;
        const value = Number(rate);
        if (!Number.isFinite(value)) continue;
        out.push({ stockCode: p.stockCode, date: p.date, time: p.time, value });
    }
    return out;
}
