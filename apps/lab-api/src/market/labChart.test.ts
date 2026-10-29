// makeLabChart 의 조립 — 후보 고르기·수정주가 환산·캐시(유령 판정 계산 자체는 core ghostTrade 테스트 몫).
import { describe, expect, it } from "vitest";
import type { DailyBar, DailyCandle, MinuteCandle } from "@trade-data-manager/market";
import { makeLabChart } from "./labChart.js";

const bar = (o: number, h: number, l: number, c: number): DailyBar => ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: "1", amount: "1" });
const day = (date: string, un: DailyBar, krx: DailyBar = un): DailyCandle => ({ stockCode: "000001", date, krx, un });
const min = (time: string, p: number[], krx = false): MinuteCandle => {
    const b = { open: String(p[0]), high: String(p[1]), low: String(p[2]), close: String(p[3]), volume: "10" };
    return { stockCode: "000001", date: "", time, un: b, krx: krx ? b : null };
};

function setup(opts: { adj: DailyCandle[]; raw?: DailyCandle[]; minutes: Record<string, MinuteCandle[]>; today?: string }) {
    const reads: string[] = [];
    const chart = makeLabChart({
        dailyCandle: { getDailyCandles: async () => opts.adj },
        rawDailyCandle: { getRawDailyCandles: async () => opts.raw ?? opts.adj },
        minuteCandle: {
            getMinuteCandles: async (_c, date) => {
                reads.push(date);
                return opts.minutes[date] ?? [];
            },
        },
        today: () => opts.today ?? "2099-01-01",
    });
    return { chart, reads };
}

const ghostDay = [min("08:00:00", [130, 130, 130, 130]), min("08:01:00", [100, 101, 99, 100]), min("09:00:00", [100, 110, 98, 105], true)];

describe("dailyWithFix", () => {
    it("UN 극값이 KRX 밖인 날만 분봉을 읽고, 걷힌 칸만 unFix 로 붙인다", async () => {
        const { chart, reads } = setup({
            adj: [day("2026-07-01", bar(100, 110, 98, 105)), day("2026-07-02", bar(130, 130, 98, 105), bar(100, 110, 98, 105))],
            minutes: { "2026-07-02": ghostDay },
        });
        const rows = await chart.dailyWithFix("000001", { from: "2026-07-01", to: "2026-07-02" });
        expect(reads).toEqual(["2026-07-02"]);
        expect(rows[0]).not.toHaveProperty("unFix");
        expect(rows[1].unFix).toEqual({ open: "100", high: "110" });
    });
    it("보정값은 그 날 수정계수로 일봉 스케일에 맞춘다(액분 뒤 = 원주가 ÷ 2)", async () => {
        const adj = [day("2026-07-02", bar(65, 65, 49, 52.5), bar(50, 55, 49, 52.5))];
        const raw = [day("2026-07-02", bar(130, 130, 98, 105), bar(100, 110, 98, 105))];
        const { chart } = setup({ adj, raw, minutes: { "2026-07-02": ghostDay } });
        const rows = await chart.dailyWithFix("000001", { from: "2026-07-02", to: "2026-07-02" });
        expect(rows[0].unFix).toEqual({ open: "50", high: "55" });
    });
    it("분봉이 없는 후보일은 UN 그대로(unFix 없음)이고 캐시하지 않는다 — 늦게 수집되면 다음 요청에서 붙는다", async () => {
        const adj = [day("2026-07-02", bar(130, 130, 98, 105), bar(100, 110, 98, 105))];
        const minutes: Record<string, MinuteCandle[]> = {};
        const { chart, reads } = setup({ adj, minutes });
        expect((await chart.dailyWithFix("000001", { from: "2026-07-02", to: "2026-07-02" }))[0]).not.toHaveProperty("unFix");
        minutes["2026-07-02"] = ghostDay;
        expect((await chart.dailyWithFix("000001", { from: "2026-07-02", to: "2026-07-02" }))[0].unFix).toEqual({ open: "100", high: "110" });
        expect(reads).toEqual(["2026-07-02", "2026-07-02"]);
    });
    it("지난 날 판정은 캐시 — 오늘은 다시 읽는다", async () => {
        const adj = [day("2026-07-02", bar(130, 130, 98, 105), bar(100, 110, 98, 105)), day("2026-07-03", bar(130, 130, 98, 105), bar(100, 110, 98, 105))];
        const { chart, reads } = setup({ adj, minutes: { "2026-07-02": ghostDay, "2026-07-03": ghostDay }, today: "2026-07-03" });
        await chart.dailyWithFix("000001", { from: "2026-07-02", to: "2026-07-03" });
        await chart.dailyWithFix("000001", { from: "2026-07-02", to: "2026-07-03" });
        expect(reads).toEqual(["2026-07-02", "2026-07-03", "2026-07-03"]);
    });
    it("환산값은 UN ⊇ KRX 범위로 맞춘다(수정계수 반올림·원주가 결손으로 어긋나도)", async () => {
        // 원주가 일봉이 비어 수정계수가 1로 물러난 날 — 원주가 분봉 값이 그대로 얹히면 KRX 고가(55)보다 크게 어긋난다
        const adj = [day("2026-07-02", bar(65, 65, 40, 52), bar(50, 55, 49, 52))];
        const { chart } = setup({ adj, raw: [], minutes: { "2026-07-02": ghostDay } });
        expect((await chart.dailyWithFix("000001", { from: "2026-07-02", to: "2026-07-02" }))[0].unFix).toEqual({ open: "65", high: "65" }); // 범위 밖으로 새지 않는다(계수 결손의 값 자체는 못 살린다)
    });
});

describe("minutesByDate", () => {
    it("빈 데이터 — minutes 빈 배열, basePrice null, rawScale 1", async () => {
        const { chart } = setup({ adj: [], minutes: {} });
        expect(await chart.minutesByDate("000001", "2026-07-02")).toEqual({ stockCode: "000001", date: "2026-07-02", minutes: [], basePrice: null, rawScale: 1 });
    });
});
