// 계산 축 — "기준선 대비 %": 타점 **그 시각**의 가격이 baseline 앵커 값 대비 몇 %인가.
//
// 파라미터 앵커 인프라의 첫 소비자. 분모(기준선 값)는 앵커가 지목한 캔들에서 **저장된 시장·값**으로 읽는다 —
// 차트에 그려지는 앵커 선(resolvePointAnchorLines)과 같은 규칙이라, 화면의 선과 축 값이 눈으로 대조된다.
// 분자(타점 시각 가격)도 **앵커의 시장**을 쓴다: 분모가 KRX 인데 분자가 UN 이면 비율이 아니라 잡음이다.
// 그래서 이 축은 시장 파라미터가 없다 — 시장은 앵커를 찍은 사람이 이미 정했다.
//
// 결손(축에서 빠짐): baseline 앵커 없음 · 앵커 캔들 미로드/미수집 · 그 시각 앵커 시장 세션 부재(KRX 프리마켓) ·
// 기준값 0. 전부 지어내지 않고 뺀다(axis.ts 규칙 3).
//
// 일봉 앵커는 **수정주가**에서 읽는다 — 차트 일봉 pane·가격선이 보는 그 값(최근 구간은 원주가와 같은 스케일이라
// 분봉 분자와 정합). 분봉 앵커는 raw 분봉 그대로.
import { computeChangeRate, type DailyCandle, type MinuteCandle, type PointAnchor, type ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import type { AxisDeps, ComputedAxisDef, ComputedAxisValue } from "./axis.js";

/** 이 축이 소비하는 파라미터. */
const PARAM = "baseline";
/** (종목,날) 동시 읽기 상한 — dailyChangeAxis 와 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

export function baselinePositionAxis(): ComputedAxisDef {
    return {
        key: "baseline-position",
        name: "기준선 대비 %",
        version: 1,
        strongerWhen: "higher",
        inputs: ["minute", "adjDaily"],
        params: [PARAM],
        compute: computeBaselinePosition,
    };
}

const pk = (p: ReviewPointKey): string => `${p.stockCode}|${p.date}|${p.time}`;

async function computeBaselinePosition(points: readonly ReviewPointKey[], deps: AxisDeps): Promise<ComputedAxisValue[]> {
    const anchors = await deps.pointAnchor.listAll();
    const anchorByPoint = new Map(anchors.filter((a) => a.param === PARAM).map((a) => [pk(a), a]));
    // 가격 앵커만 유효(field+market) — 시각 앵커로 저장된 baseline 은 없어야 하지만(서버 검증), 방어적으로 거른다.
    const jobs = points
        .map((p) => ({ p, a: anchorByPoint.get(pk(p)) }))
        .filter((j): j is { p: ReviewPointKey; a: PointAnchor & { field: NonNullable<PointAnchor["field"]>; market: NonNullable<PointAnchor["market"]> } } =>
            j.a?.field != null && j.a?.market != null,
        );
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
        if (baseline === undefined || Number(baseline) <= 0) continue; // 앵커 캔들 미수집·0 — 결손

        // 분자 — 타점 시각 이하 마지막 분봉 종가(forward fill), **앵커의 시장**. 세션 부재면 결손.
        const bars = minutesByDay.get(`${p.stockCode}|${p.date}`) ?? [];
        let close: string | undefined;
        for (const b of bars) {
            if (b.time > p.time) break;
            const bar = a.market === "krx" ? b.krx : b.un;
            if (bar) close = bar.close;
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

