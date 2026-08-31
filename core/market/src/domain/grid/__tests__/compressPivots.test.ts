// compressPivots — 피벗 축약(B안, 2026-08-31) 스펙을 합성 피벗 배열로 못 박는다.
// ① 러닝 최고가 갱신 확정 고점 ② kept 고점 사이 구간별 최저 저점 1개 ③ 꼬리 최저 저점 1개(미확정 허용).
// legAmount 는 버려진 피벗 몫이 다음 kept 피벗에 합산(kept 이웃 구간 합) — 마지막 kept 이후 잔여만 소실.
import { describe, expect, it } from "vitest";
import type { GridPivot, PointGrid } from "../grid.js";
import { compressPivots } from "../grid.js";
import { DEFAULT_POINT_DEFINITION, pointsOf } from "../points.js";

const hi = (min: number, price: number, confirmedMin: number | null, leg = 0): GridPivot => ({ kind: "high", min, price, confirmedMin, legAmount: String(leg) });
const lo = (min: number, price: number, confirmedMin?: number | null, leg = 0): GridPivot => ({
    kind: "low", min, price, confirmedMin: confirmedMin === undefined ? min + 1 : confirmedMin, legAmount: String(leg),
});

describe("compressPivots", () => {
    it("B류(하락 중 낮은 반등 고점)와 구간 중간 저점은 버려지고, 구간 최저 저점 1개만 남는다", () => {
        const full = [hi(600, 100, 601, 1), lo(610, 90, 611, 2), hi(620, 95, 621, 3), lo(630, 85, 631, 4), hi(640, 110, 641, 5)];
        expect(compressPivots(full)).toEqual([
            hi(600, 100, 601, 1),
            lo(630, 85, 631, 9), // 2+3+4 — 버려진 저점·B류 고점 몫 합산
            hi(640, 110, 641, 5),
        ]);
    });

    it("구간 최저가 동가면 이른 저점이 남는다", () => {
        const full = [hi(600, 100, 601, 1), lo(610, 90, 611, 2), hi(620, 95, 621, 3), lo(630, 90, 631, 4), hi(640, 110, 641, 5)];
        expect(compressPivots(full).map((p) => p.min)).toEqual([600, 610, 640]);
    });

    it("첫 kept 고점 이전 선행 저점은 버려지고 legAmount 몫만 첫 kept 고점에 합산된다", () => {
        const full = [lo(540, 80, 541, 7), hi(600, 100, 601, 1)];
        expect(compressPivots(full)).toEqual([hi(600, 100, 601, 8)]);
    });

    it("runningMaxOf — 실제 세션 최고가에 못 미치는 확정 고점은 B류 취급(legAmount 는 다음 kept 에 합산)", () => {
        // 확정 고점 100(600분)이 그 시각 세션 최고가 105(예: 넓은 피벗 봉의 반대편 극값)보다 낮다 —
        // kept 에서 제외돼야 앞 시각 캔들이 이 레벨을 넘는 역전이 없다. 120(640분)은 실제 갱신이라 kept.
        const full = [lo(540, 80, 541, 1), hi(600, 100, 601, 2), lo(610, 90, 611, 3), hi(640, 120, 641, 4)];
        const runMax = new Map([[600, 105], [640, 120]]);
        expect(compressPivots(full, (min) => runMax.get(min) ?? Infinity)).toEqual([hi(640, 120, 641, 10)]);
    });

    it("확정 kept 고점이 하나도 없으면 빈 배열(저점만으론 소비자가 못 쓴다)", () => {
        expect(compressPivots([])).toEqual([]);
        expect(compressPivots([lo(540, 80, 541), hi(600, 100, null)])).toEqual([]); // 미확정 고점 꼬리뿐
    });

    it("미확정 꼬리 고점은 버려지고, 마지막 kept 고점 이후 최저 저점(미확정 허용)이 꼬리로 남는다", () => {
        const full = [hi(600, 100, 601, 1), lo(610, 90, 611, 2), hi(620, 95, 621, 3), lo(630, 88, null, 4), hi(640, 99, null, 5)];
        // 620·640 은 각각 B류·미확정이라 kept 아님 — 610(90)보다 630(88)이 낮아 꼬리는 630.
        expect(compressPivots(full)).toEqual([hi(600, 100, 601, 1), lo(630, 88, null, 9)]);
    });

    it("불변식 — min 강한 단조 증가·high/low 교대·legAmount 총합 보존(마지막 kept 이후 잔여 제외)", () => {
        const full = [
            lo(540, 95, 545, 11), hi(550, 100, 551, 12), lo(560, 90, 561, 13), hi(570, 98, 571, 14),
            lo(580, 85, 581, 15), hi(590, 120, 591, 16), lo(600, 105, 601, 17), hi(610, 118, 611, 18), lo(620, 100, null, 19),
        ];
        const out = compressPivots(full);
        for (let i = 1; i < out.length; i++) {
            expect(out[i].min).toBeGreaterThan(out[i - 1].min);
            expect(out[i].kind).not.toBe(out[i - 1].kind);
        }
        const sum = (ps: GridPivot[]): bigint => ps.reduce((a, p) => a + BigInt(p.legAmount), 0n);
        expect(sum(out)).toBe(sum(full)); // 이 픽스처는 마지막 kept(꼬리 저점 620) 뒤 잔여가 없다
        // kept 고점 = 550(100)·590(120)뿐 — 570(98)·610(118)은 러닝 최고가 미달(B류)이라 버려진다.
        expect(out.map((p) => [p.kind, p.min])).toEqual([
            ["high", 550], ["low", 580], ["high", 590], ["low", 620],
        ]);
        expect(out.map((p) => p.legAmount)).toEqual(["23", "42", "16", "54"]); // 11+12 · 13+14+15 · 16 · 17+18+19
    });

    it("pointsOf 는 축약 전후 동일하다(mergeRisePct=0 — kept 고점이 레벨 후보의 상위집합)", () => {
        const full = [
            lo(540, 9500, 545), hi(550, 10000, 551), lo(560, 9000, 561), hi(570, 9800, 571),
            lo(580, 8500, 581), hi(590, 12000, 591), lo(600, 10500, 601), hi(610, 11800, 611), lo(620, 10000, null),
        ];
        const highsAt: Record<number, number> = { 545: 9500, 555: 10100, 575: 10500, 595: 12500, 615: 12800 };
        const mkGrid = (pivots: GridPivot[]): PointGrid => ({
            base: 9500,
            touchMin: 545,
            pivots,
            newHighs: Object.entries(highsAt).map(([min, high]) => ({
                min: Number(min), open: high - 100, high, low: high - 200, close: high, tv: "9900000000",
            })),
        });
        const fullPts = pointsOf(mkGrid(full));
        expect(pointsOf(mkGrid(compressPivots(full)))).toEqual(fullPts);
        // 공허 동치가 아님 — 기준선(9500)·마디 10000·마디 12000 세 레벨이 전부 Point 를 낸다.
        expect(fullPts.map((p) => [p.min, p.levelPrice])).toEqual([
            [545, 9500], [555, 10000], [595, 12000],
        ]);
    });

    it("mergeRisePct > 0 은 축약 전후가 다를 수 있다(직전 저점 → 구간 최저 저점, 수용된 편향)", () => {
        // 마디 12000: full 의 직전 저점(9600) 대비 +25.0% → 임계 26% 에 병합.
        // 축약 후 그 자리(구간 최저 8500) 대비 +41.2% → 병합 안 됨 — 레벨 12000 이 살아난다.
        const full = [hi(550, 10000, 551), lo(560, 8500, 561), hi(570, 9800, 571), lo(580, 9600, 581), hi(590, 12000, 591)];
        const def = { ...DEFAULT_POINT_DEFINITION, mergeRisePct: 26 };
        const mkGrid = (pivots: GridPivot[]): PointGrid => ({
            base: 9000,
            touchMin: 540,
            pivots,
            newHighs: [
                { min: 545, open: 9000, high: 9100, low: 8950, close: 9100, tv: "9900000000" },
                { min: 585, open: 9950, high: 10050, low: 9900, close: 10050, tv: "9900000000" },
                { min: 595, open: 12000, high: 12100, low: 11900, close: 12100, tv: "9900000000" },
            ],
        });
        expect(pointsOf(mkGrid(full), def).map((p) => [p.min, p.levelPrice])).toEqual([
            [545, 9000], [585, 10000], // 12000 마디는 병합 — 12100 캔들은 남은 레벨이 없어 Point 아님
        ]);
        expect(pointsOf(mkGrid(compressPivots(full)), def).map((p) => [p.min, p.levelPrice])).toEqual([
            [545, 9000], [585, 10000], [595, 12000],
        ]);
    });
});
