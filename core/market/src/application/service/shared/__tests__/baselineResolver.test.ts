import { describe, it, expect } from "vitest";
import type { ChartAnchor, DailyCandle, MinuteCandle, ReviewPointKey } from "#domain";
import { chartKeyOf } from "#domain";
import { resolveBaselines } from "../baselineResolver.js";

const CODE = "005930";
const DATE = "2026-07-02";

const daily = (date: string, high: number): DailyCandle => ({
    stockCode: CODE,
    date,
    krx: { open: "0", high: String(high), low: "0", close: "0", volume: "0", amount: "0" },
    un: { open: "0", high: String(high), low: "0", close: "0", volume: "0", amount: "0" },
});

const point = (time = "09:30:00"): ReviewPointKey => ({ stockCode: CODE, date: DATE, time });

const line = (anchorDate: string, over: Partial<ChartAnchor> = {}): ChartAnchor => ({ stockCode: CODE,
    date: DATE,
    param: "baseline",
    anchorDate,
    field: "high",
    market: "un",
    ...over,
});

function deps(v: { dailies?: DailyCandle[]; minutesByDay?: Record<string, MinuteCandle[]> }) {
    let dailyReads = 0;
    const d = {
        minute: { getMinuteCandles: (_c: string, date: string) => Promise.resolve(v.minutesByDay?.[date] ?? []) },
        adjDaily: {
            getDailyCandles: (_c: string, range: { from: string; to: string }) => {
                dailyReads++;
                return Promise.resolve((v.dailies ?? []).filter((x) => x.date >= range.from && x.date <= range.to));
            },
        },
    };
    return { d, reads: () => dailyReads };
}

describe("resolveBaselines", () => {
    const P = point();
    const KEY = chartKeyOf(P);

    it("후보 0 → 키 없음(입력 전), 후보 1 → 가격을 읽지 않고 확정", async () => {
        const { d, reads } = deps({});
        const none = await resolveBaselines([P], [], d);
        expect(none.has(KEY)).toBe(false);

        const one = line("2026-06-30");
        const out = await resolveBaselines([P], [one], d);
        expect(out.get(KEY)).toEqual(one);
        expect(reads()).toBe(0); // 가격 미조회 — 거리 축의 견고성이 흔한 경우(선 하나)에 보존되는 근거
    });

    it("후보 ≥2 → 가격 최저를 고른다(아래 있는 선이 기준을 가져간다)", async () => {
        const { d } = deps({ dailies: [daily("2026-06-25", 12000), daily("2026-06-30", 10000)] });
        const low = line("2026-06-30");
        const out = await resolveBaselines([P], [line("2026-06-25"), low], d);
        expect(out.get(KEY)).toEqual(low);
    });

    it("타이(같은 가격)는 좌표 최신 — 그 가격대를 마지막으로 건드린 선", async () => {
        const { d } = deps({ dailies: [daily("2026-06-25", 10000), daily("2026-06-30", 10000)] });
        const later = line("2026-06-30");
        const out = await resolveBaselines([P], [later, line("2026-06-25")], d);
        expect(out.get(KEY)).toEqual(later);
    });

    it("후보 중 하나라도 가격을 못 읽으면 null(결손) — 못 읽은 선이 더 낮을 수 있다", async () => {
        const { d } = deps({ dailies: [daily("2026-06-25", 12000)] }); // 6/30 캔들 미수집
        const out = await resolveBaselines([P], [line("2026-06-25"), line("2026-06-30")], d);
        expect(out.get(KEY)).toBeNull();
    });

    it("분봉 앵커 후보는 그 날 분봉에서 가격을 꺼낸다", async () => {
        const bar: MinuteCandle = {
            stockCode: CODE,
            date: "2026-06-30",
            time: "13:00:00",
            krx: null,
            un: { open: "9000", high: "9000", low: "9000", close: "9000", volume: "1" },
        };
        const { d } = deps({ dailies: [daily("2026-06-25", 12000)], minutesByDay: { "2026-06-30": [bar] } });
        const minuteLine = line("2026-06-30", { anchorTime: "13:00:00" });
        const out = await resolveBaselines([P], [line("2026-06-25"), minuteLine], d);
        expect(out.get(KEY)).toEqual(minuteLine);
    });

    it("다른 차트·다른 param·타점 소유·시각 앵커는 후보에서 빠진다", async () => {
        const { d } = deps({});
        const mine = line("2026-06-30");
        const out = await resolveBaselines(
            [P],
            [
                mine,
                line("2026-06-29", { date: "2026-07-01" }), // 다른 차트
                line("2026-06-28", { param: "ignore-candle", field: undefined, market: undefined }), // 다른 param
                line("2026-06-27", { time: "09:30:00" }), // 타점 소유(예약) — 병합 규칙 미정이라 제외
                line("2026-06-26", { field: undefined, market: undefined }), // 시각 앵커 — 값을 못 꺼낸다
            ],
            d,
        );
        expect(out.get(KEY)).toEqual(mine); // 나머지가 섞였다면 다중이 되어 가격 조회가 필요했을 것
    });
});
