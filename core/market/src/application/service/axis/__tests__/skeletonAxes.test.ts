import { describe, it, expect } from "vitest";
import type { ChartAnchor, DailyCandle, MinuteCandle, ReviewPointKey } from "#domain";
import { SKELETON_AXES, SKELETON_SHAPE_VERSION } from "../skeletonAxes.js";
import type { AxisDeps } from "../axis.js";

const CODE = "005930";
const DATE = "2026-07-02";

const daily = (date: string, price: number): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: String(price), high: String(price), low: String(price), close: String(price), volume: "1000", amount: "0" },
    un: { open: String(price), high: String(price), low: String(price), close: String(price), volume: "1000", amount: "0" },
});

const point = (time = "09:30:00"): ReviewPointKey => ({ stockCode: CODE, date: DATE, time });
const minute = (time: string, price: number): MinuteCandle => ({
    stockCode: CODE,
    date: DATE,
    time,
    krx: null,
    un: { open: String(price), high: String(price), low: String(price), close: String(price), volume: "10" },
});
let seq = 0;
/** 차트 소유 일봉 골격 피벗 — 타점 시각 없음. */
const pivot = (anchorDate: string, over: Partial<ChartAnchor> = {}): ChartAnchor =>
    ({ id: String(++seq), stockCode: CODE, date: DATE, param: "skeleton", anchorDate, field: "high", market: "un", ...over });
/** 차트 소유 분봉 골격 피벗 — 일봉 pivot 과 같은 소유, anchorTime 만 분봉. */
const mpivot = (anchorTime: string, over: Partial<ChartAnchor> = {}): ChartAnchor =>
    ({ id: String(++seq), stockCode: CODE, date: DATE, param: "skeleton-minute", anchorDate: DATE, anchorTime, field: "high", market: "un", ...over });

function deps(v: { dailies?: DailyCandle[]; minutesByDay?: Record<string, MinuteCandle[]>; anchors?: ChartAnchor[]; reviewPoints?: ReviewPointKey[] }): AxisDeps {
    return {
        minute: { getMinuteCandles: (_c, date) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        rawDaily: { getRawDailyCandles: () => Promise.resolve([]) },
        adjDaily: { getDailyCandles: (_c, range) => Promise.resolve((v.dailies ?? []).filter((d) => d.date >= range.from && d.date <= range.to)) },
        chartAnchor: { listByChart: () => Promise.resolve([]), listAll: () => Promise.resolve(v.anchors ?? []), listAnchoredCharts: () => Promise.resolve([]) },
        // 타점 종가 합성의 형제 목록 — 실제로는 계산 대상 타점이 언제나 여기 포함된다(listAllPoints).
        reviewPoints: { listByChart: () => Promise.resolve([]), listAllPoints: () => Promise.resolve(v.reviewPoints ?? []) },
    };
}

const axisOf = (key: string) => SKELETON_AXES.find((a) => a.key === key)!;
/** 6/22~7/01 여덟 거래일 — dayIndex 는 이 창 안 순번. */
const HISTORY = [
    daily("2026-06-22", 10000),
    daily("2026-06-23", 10500),
    daily("2026-06-24", 12000), // idx 2 — P2 고점
    daily("2026-06-25", 11500),
    daily("2026-06-26", 11000), // idx 4 — P3 골
    daily("2026-06-29", 11400),
    daily("2026-06-30", 11800),
    daily("2026-07-01", 11900),
];

describe("골격 파생 축", () => {
    it("네 축이 한 골격에서 각자 다른 숫자를 고른다", async () => {
        const P = point();
        const anchors = [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24"), pivot("2026-06-26", { field: "close" })];
        const d = deps({ dailies: HISTORY, anchors });

        expect((await axisOf("skeleton-base-rise").compute([P], d))[0].value).toBeCloseTo(20, 0); // (12000-10000)/10000
        expect((await axisOf("skeleton-base-days").compute([P], d))[0].value).toBe(2); // idx 0 → 2
        expect((await axisOf("skeleton-base-slope").compute([P], d))[0].value).toBeCloseTo(10, 0); // 20% / 2일
        expect((await axisOf("skeleton-pullback").compute([P], d))[0].value).toBeCloseTo(50, 0); // (12000-11000)/2000
    });

    it("골격 미입력 차트는 축에서 빠진다(입력 전) — 캔들 읽기도 없다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.adjDaily = { getDailyCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axisOf("skeleton-base-rise").compute([point()], d)).toEqual([]);
        expect(reads).toBe(0);
    });

    it("피벗이 하나면 골격이 아니다 — 통째 결손(반쪽 형태를 지어내지 않는다)", async () => {
        const d = deps({ dailies: HISTORY, anchors: [pivot("2026-06-24")] });
        expect(await axisOf("skeleton-base-rise").compute([point()], d)).toEqual([]);
    });

    it("피벗 하나라도 창 밖·미수집이면 그 골격 통째 결손 — 뺀 모양은 찍은 모양이 아니다", async () => {
        const anchors = [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24"), pivot("2020-01-05")]; // 창 밖
        const d = deps({ dailies: HISTORY, anchors });
        expect(await axisOf("skeleton-base-rise").compute([point()], d)).toEqual([]);
    });

    it("차트 소유 — 같은 차트의 두 타점이 같은 골격 값을 받는다", async () => {
        const anchors = [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24")];
        const out = await axisOf("skeleton-base-rise").compute([point("09:30:00"), point("14:00:00")], deps({ dailies: HISTORY, anchors }));
        expect(out.map((v) => v.value)).toEqual([20, 20]);
    });

    it("다른 차트(날짜)의 골격은 안 샌다", async () => {
        const anchors = [pivot("2026-06-22", { field: "open", date: "2026-07-03" }), pivot("2026-06-24", { date: "2026-07-03" })];
        expect(await axisOf("skeleton-base-rise").compute([point()], deps({ dailies: HISTORY, anchors }))).toEqual([]);
    });

    it("기울기만 결손인 골격도 나머지 축은 값을 낸다 — 축별 독립 결손", async () => {
        // 한 캔들 안 상승(시→고) = 거래일 0 → 기울기 결손, 크기·기간·되돌림은 정상.
        const anchors = [pivot("2026-06-24", { field: "open" }), pivot("2026-06-24"), pivot("2026-06-26", { field: "close" })];
        const d = deps({ dailies: HISTORY, anchors });
        expect(await axisOf("skeleton-base-slope").compute([point()], d)).toEqual([]);
        expect((await axisOf("skeleton-base-days").compute([point()], d))[0].value).toBe(0);
    });

    it("축 version 은 형태층 버전을 품는다 — 형태 계산을 고치면 전 축이 함께 무효화", () => {
        for (const a of SKELETON_AXES) expect(Math.floor(a.version / 100)).toBe(SKELETON_SHAPE_VERSION);
    });

    it("알갱이 선언 — 일봉 골격은 day(그날 전 타점 같은 값), 분봉 골격은 point", () => {
        for (const a of SKELETON_AXES) expect(a.grain).toBe(a.key.startsWith("skeleton-min") ? "point" : "day");
    });

    it("⚠ 당일 피벗은 재료가 아니다 — 걸러도 형태가 나오면 남은 피벗으로 값을 낸다", async () => {
        // 완전한 3점 골격 + 당일(DATE) 피벗 하나. 당일 캔들이 HISTORY 에 없어도(오늘 복기) 값이 살아야 한다 —
        // 리졸버 앞에서 거르니까("피벗 하나라도 미수집이면 통째 결손"에 당일 피벗이 안 걸린다).
        const anchors = [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24"), pivot("2026-06-26", { field: "close" }), pivot(DATE)];
        const d = deps({ dailies: HISTORY, anchors });
        expect((await axisOf("skeleton-base-rise").compute([point()], d))[0].value).toBeCloseTo(20, 0);
    });

    it("당일 피벗을 거르고 남는 게 모자라면 결손 — 하루에 값 하나를 주는 이상 당일 정보는 미래다", async () => {
        // 전일 피벗 하나 + 당일 피벗 하나 → 거르면 1점 = 골격이 아니다 → 결손(미배치).
        const anchors = [pivot("2026-06-24"), pivot(DATE)];
        const d = deps({ dailies: [...HISTORY, daily(DATE, 12500)], anchors });
        expect(await axisOf("skeleton-base-rise").compute([point()], d)).toEqual([]);
    });

    it("분봉 골격은 당일 가드가 없다 — 피벗이 본디 당일 장중 경로다", async () => {
        // mpivot 은 anchorDate = DATE(당일). 가드가 분봉에 적용되면 전부 걸러져 아무 값도 안 나온다.
        const anchors = [mpivot("09:10:00"), mpivot("09:40:00", { field: "low" })];
        const minutes = [minute("09:10:00", 10000), minute("09:40:00", 10800)];
        const d = deps({ minutesByDay: { [DATE]: minutes }, anchors, reviewPoints: [point("09:40:00")] });
        const out = await axisOf("skeleton-min-pullback").compute([point("09:40:00")], d);
        expect(out.length).toBe(1);
    });

    it("각 축은 자기 해상도의 param 만 필수 선언한다(결손 분모가 그 골격 있는 것으로 좁혀진다)", () => {
        for (const a of SKELETON_AXES) {
            expect(a.params).toEqual([a.key.startsWith("skeleton-min-") ? "skeleton-minute" : "skeleton"]);
        }
    });
});

// ── 분봉 골격 축(차트 소유·타점별 읽기 절단) — 일봉과 갈리는 지점만 본다(형태 계산은 공용이라 재검증 불필요).
describe("분봉 골격 축", () => {
    /** 09:00 4000 → 09:10 4400(+10%) → 09:25 4160 : 상승 10%/10분, 되돌림 60%. */
    const BARS = [minute("09:00:00", 4000), minute("09:10:00", 4400), minute("09:25:00", 4160)];
    const skel: ChartAnchor[] = [
        mpivot("09:00:00", { field: "open" }),
        mpivot("09:10:00"),
        mpivot("09:25:00", { field: "close" }),
    ];

    it("기울기 단위가 **분**이다 — 10% / 10분 = 1.0%/분", async () => {
        const P = point("09:30:00");
        // 09:30 분봉이 있어야 자기 종가 합성이 가능하다(없으면 결손 규칙에 걸린다).
        const d = deps({ minutesByDay: { [DATE]: [...BARS, minute("09:30:00", 4160)] }, anchors: skel, reviewPoints: [P] });
        expect((await axisOf("skeleton-min-slope").compute([P], d))[0].value).toBeCloseTo(1.0, 2);
        expect((await axisOf("skeleton-min-pullback").compute([P], d))[0].value).toBeCloseTo(60, 0);
    });

    it("**읽기 절단 + 자기 종가 합성** — 이른 타점은 자기 시각까지 + 그 순간의 위치를 본다", async () => {
        const p0915 = point("09:15:00");
        const p1400 = point("14:00:00");
        const bars = [...BARS, minute("09:15:00", 4300), minute("14:00:00", 4200)];
        const d = deps({ minutesByDay: { [DATE]: bars }, anchors: skel, reviewPoints: [p0915, p1400] });
        // 09:15: 09:25 골은 미래 — 대신 자기 종가(4300)가 경로의 끝 = 되돌림 (4400-4300)/400 = 25.
        expect((await axisOf("skeleton-min-pullback").compute([p0915], d))[0].value).toBeCloseTo(25, 0);
        // 14:00: 하루 경로 전체 + 형제(09:15)·자기 종가 — 골은 여전히 4160 → 60.
        expect((await axisOf("skeleton-min-pullback").compute([p1400], d))[0].value).toBeCloseTo(60, 0);
    });

    it("자기 시각까지 피벗이 2개 미만이면 미입력 취급 — 자기 종가 하나로는 골격이 아니다", async () => {
        const early = point("08:55:00");
        const d = deps({ minutesByDay: { [DATE]: [minute("08:55:00", 3990), ...BARS] }, anchors: skel, reviewPoints: [early] });
        expect(await axisOf("skeleton-min-slope").compute([early], d)).toEqual([]);
    });

    it("일봉 골격은 분봉 축에 안 섞인다(그 반대도) — param 이 해상도라 경로가 갈린다", async () => {
        const P = point();
        const dailyOnly = deps({ dailies: HISTORY, minutesByDay: { [DATE]: BARS }, anchors: [pivot("2026-06-22", { field: "open" }), pivot("2026-06-24")] });
        expect(await axisOf("skeleton-min-slope").compute([P], dailyOnly)).toEqual([]);

        const minuteOnly = deps({ dailies: HISTORY, minutesByDay: { [DATE]: BARS }, anchors: skel });
        expect(await axisOf("skeleton-base-rise").compute([P], minuteOnly)).toEqual([]);
    });

    it("분봉 미수집이면 그 골격 통째 결손", async () => {
        const d = deps({ minutesByDay: { [DATE]: BARS.slice(0, 2) }, anchors: skel }); // 09:25 봉 없음
        expect(await axisOf("skeleton-min-slope").compute([point("09:30:00")], d)).toEqual([]);
    });

    it("옛 타점 소유 행(time 있음)은 잔재 — 무시된다", async () => {
        const legacy = skel.map((a) => ({ ...a, time: "09:30:00" }));
        const d = deps({ minutesByDay: { [DATE]: BARS }, anchors: legacy });
        expect(await axisOf("skeleton-min-slope").compute([point("09:30:00")], d)).toEqual([]);
    });

    it("골격 없는 타점은 분봉 읽기도 없다", async () => {
        let reads = 0;
        const d = deps({ anchors: [] });
        d.minute = { getMinuteCandles: () => { reads++; return Promise.resolve([]); } };
        expect(await axisOf("skeleton-min-pullback").compute([point()], d)).toEqual([]);
        expect(reads).toBe(0);
    });
});
