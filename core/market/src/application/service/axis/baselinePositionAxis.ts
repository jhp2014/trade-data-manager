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
// ## 분자·분모는 **같은 스케일**이어야 한다(rawScaleOf)
// 분모는 수정주가(전 구간이 오늘 스케일 한 벌), 분자는 원주가 분봉(그 날 실제 체결값)이다. 차트 날짜 **이후**에
// 감자·액분·무증이 있었던 종목은 그 사이에 수정주가가 소급 재작성돼 두 값의 스케일이 이벤트 배율만큼 어긋난다
// (액분 5:1 이면 값이 +400% 로 폭주 — 실제로 그렇게 났다). 그래서 앵커 가격을 **타점일의 원주가 스케일**로
// 되돌린 뒤 나눈다: `기준선(타점일 스케일) = 수정주가 앵커값 × rawScaleOf(타점일)`.
// 수정주가를 다리로 쓰는 이유는, 앵커일과 타점일 **사이**에 이벤트가 있으면 원주가끼리도 스케일이 다르기 때문이다
// — 전 구간 단일 스케일인 건 수정주가뿐이라 "수정주가에서 만나 타점일 스케일로 함께 내려온다".
// (같은 다리를 차트 분봉 pane 의 기준선·정규화 패널 수준선도 탄다 — 화면과 축이 같은 값을 봐야 눈 대조가 선다.)
//
// **시장은 값을 꺼내는 경로일 뿐 값의 속성이 아니다.** 앵커의 market·field 는 기준선 값을 그 캔들의 어디서
// 꺼낼지만 말한다(오염된 UN 고가 회피 등). 꺼내고 나면 그냥 가격 하나이고, 그 뒤로 시장 개념은 사라진다.
// 그래서 분자는 **언제나 UN 종가**다 — 분봉은 늘 UN 전체를 본다는 화면 규칙과 같고, 예전처럼 분자를 앵커
// 시장에 묶었더니 KRX 앵커를 쓴 NXT 단독 시간대(프리마켓·시간외) 타점이 통째로 결손이 됐다.
//
// 결손(축에서 빠짐): 기준선 없음/확정불가 · 앵커 캔들 미로드/미수집 · 기준값 0 · 타점이 첫 분봉보다 이름.
// 전부 지어내지 않고 뺀다(axis.ts 규칙 3).
//
// 일봉 앵커는 **수정주가**에서 읽는다 — 차트 일봉 pane·선이 보는 그 값. 분봉 앵커는 raw 분봉 그대로이고,
// 둘의 스케일 차이는 위(rawScaleOf)에서 정리한다.
//
// ⚠ 눈 대조 방법이 다른 축과 다르다. 차트 % 눈금은 전일종가 기준이라 화면의 %p 간격과 이 축 값은 분모가 다르다.
//   대조는 **가격 두 개**로: 차트의 기준선 가격과 타점 시각 가격을 읽어 직접 나눈다.
import { BASELINE_PARAM, candlePrice, chartKeyOf, computeChangeRate, rawScaleOf, type DailyCandle, type MinuteCandle, type ReviewPointKey } from "#domain";
import { mapWithConcurrency } from "../../concurrency.js";
import { resolveBaselines } from "../shared/baselineResolver.js";
import type { AxisDeps, PointComputedAxisDef, ComputedAxisValue } from "./axis.js";

/** (종목,날) 동시 읽기 상한 — dailyChangeAxis 와 같은 이유(커넥션 풀 포화 방지). */
const DAY_CONCURRENCY = 8;

export function baselinePositionAxis(): PointComputedAxisDef {
    return {
        key: "baseline-position",
        name: "기준선 대비 %",
        version: 4, // v4: 분모(수정주가)를 타점일 원주가 스케일로 환산 — 이벤트 종목의 배율 폭주 수정
        strongerWhen: "higher",
        inputs: ["minute", "rawDaily", "adjDaily"],
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

    // 스케일 환산비 — 타점일(분모를 내려놓을 자리) + 분봉 앵커의 날(원주가라 수정주가로 올려야 하는 자리).
    // 그 하루짜리 raw·adj 일봉 한 줄씩이고, 이벤트가 없으면 1이라 값에 아무 일도 일어나지 않는다.
    const scaleKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { p, a } of jobs) {
        scaleKeys.set(`${p.stockCode}|${p.date}`, { stockCode: p.stockCode, date: p.date });
        if (a.anchorTime) scaleKeys.set(`${a.stockCode}|${a.anchorDate}`, { stockCode: a.stockCode, date: a.anchorDate });
    }
    const scaleByDay = new Map<string, number>();
    await mapWithConcurrency([...scaleKeys.values()], DAY_CONCURRENCY, async (d) => {
        const range = { from: d.date, to: d.date };
        const [raw, adj] = await Promise.all([
            deps.rawDaily.getRawDailyCandles(d.stockCode, range),
            deps.adjDaily.getDailyCandles(d.stockCode, range),
        ]);
        scaleByDay.set(`${d.stockCode}|${d.date}`, rawScaleOf(raw, adj, d.date));
    });

    // 일봉 앵커 값 = 그 하루짜리 수정주가 조회(유니크 (종목,날짜)당 1회).
    const dailyKeys = new Map<string, { stockCode: string; date: string }>();
    for (const { a } of jobs) if (!a.anchorTime) dailyKeys.set(`${a.stockCode}|${a.anchorDate}`, { stockCode: a.stockCode, date: a.anchorDate });
    const dailyByKey = new Map<string, DailyCandle | undefined>();
    await mapWithConcurrency([...dailyKeys.values()], DAY_CONCURRENCY, async (d) => {
        const rows = await deps.adjDaily.getDailyCandles(d.stockCode, { from: d.date, to: d.date });
        dailyByKey.set(`${d.stockCode}|${d.date}`, rows.find((r) => r.date === d.date));
    });

    const scaleOf = (stockCode: string, date: string): number => scaleByDay.get(`${stockCode}|${date}`) ?? 1;
    const out: ComputedAxisValue[] = [];
    for (const { p, a } of jobs) {
        // 분모 — 앵커가 지목한 캔들의 저장된 시장·값을 **수정주가 스케일**로 꺼내고(분봉 앵커면 그 날 비로 올린다),
        // 다시 **타점일 원주가 스케일**로 내린다. 이벤트 없는 날은 두 비가 다 1이라 옛 값 그대로다.
        let adjBaseline: number | null;
        if (a.anchorTime) {
            const m = minutesByDay.get(`${a.stockCode}|${a.anchorDate}`)?.find((c) => c.time === a.anchorTime);
            const price = candlePrice((a.market === "krx" ? m?.krx : m?.un)?.[a.field]);
            const anchorScale = scaleOf(a.stockCode, a.anchorDate);
            adjBaseline = price === null || anchorScale <= 0 ? price : price / anchorScale;
        } else {
            adjBaseline = candlePrice(dailyByKey.get(`${a.stockCode}|${a.anchorDate}`)?.[a.market]?.[a.field]);
        }
        if (adjBaseline === null) continue; // 앵커 캔들 미수집·0 — 결손(도메인 규칙 한 곳)
        const baseline = adjBaseline * scaleOf(p.stockCode, p.date);

        // 분자 — 타점 시각 이하 마지막 분봉 종가(forward fill), **언제나 UN**(UN 바는 항상 존재 → 세션 결손 없음).
        const bars = minutesByDay.get(`${p.stockCode}|${p.date}`) ?? [];
        let close: string | undefined;
        for (const b of bars) {
            if (b.time > p.time) break;
            close = b.un.close;
        }
        if (close === undefined) continue;

        const rate = computeChangeRate(close, String(baseline));
        if (rate === null) continue;
        const value = Number(rate);
        if (!Number.isFinite(value)) continue;
        out.push({ stockCode: p.stockCode, date: p.date, time: p.time, value });
    }
    return out;
}
