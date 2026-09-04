// outcome — 결과 걷기(breakpoint 압축)와 T 단면(상태 3종·회복·세션 최고가)을 격자 리터럴로 못 박는다.
// 규칙: decisions.md "시그널 결과".
import { describe, expect, it } from "vitest";
import type { GridPivot, PointGrid } from "../grid.js";
import { sliceOutcome, walkOutcome, type OutcomeWalk } from "../outcome.js";
import { legHighOf } from "../windows.js";

const hi = (min: number, price: number): GridPivot => ({ kind: "high", min, price, confirmedMin: min + 1, cum: "0", cross: null });
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: null, cum: "0", cross: null });
const gridOf = (pivots: GridPivot[], sessionHigh: { min: number; price: number }): PointGrid =>
    ({ base: null, touch: null, pivots, newHighs: [], prevBase: null, prevBaseKrx: null, sessionHigh });

// 세션(zigzag 2% 준수 — 저점 깊이 전부 ≥ 2%):
//   H1 560 @10000 → L1 565 @9700  (깊이 3.0%)
//   H2 580 @10500 → L2 585 @10250 (깊이 ~2.38% — 러닝 최대 미만이라 breakpoint 아님)
//   H3 600 @11000 → L3 605 @10450 (깊이 5.0%)
//   H4 620 @11500 → L4 625 @11270 (깊이 2.0% — 경계값, breakpoint 아님)
//   꼬리: L4 회복 후 상승 마감 — 세션 최고가 11800(@630, 미확정이라 피벗엔 없음).
const PIVOTS = [hi(560, 10000), lo(565, 9700), hi(580, 10500), lo(585, 10250), hi(600, 11000), lo(605, 10450), hi(620, 11500), lo(625, 11270)];
const grid = gridOf(PIVOTS, { min: 630, price: 11800 });
const CLOSE = 9800;

describe("walkOutcome — breakpoint 러닝-최대 압축", () => {
    it("깊이의 러닝 최대만 남는다(3.0 → 5.0), 세션 최고가가 실린다", () => {
        const w = walkOutcome(grid, 555);
        expect(w.breaks.map((b) => [Math.round(b.depth * 100) / 100, b.highMin, b.lowMin])).toEqual([
            [3, 560, 565],
            [5, 600, 605],
        ]);
        expect(w.sessionHigh).toEqual({ min: 630, price: 11800 });
    });

    it("시그널 뒤에서 시작한 걷기는 그 뒤 사이클만 본다", () => {
        const w = walkOutcome(grid, 590);
        expect(w.breaks.map((b) => b.highMin)).toEqual([600]); // 깊이 5.0 하나(뒤의 2.0 은 미만)
    });

    it("시그널 후 확정 고점이 없으면 breaks 빈 배열 — 결손이 아니라 무눌림(세션 최고가는 그대로)", () => {
        const w = walkOutcome(grid, 621);
        expect(w.breaks).toEqual([]);
        expect(w.sessionHigh.price).toBe(11800);
    });
});

describe("sliceOutcome — T 단면(상태 3종, 전부 정확값)", () => {
    it("T=2 특수해 — breakpoint 가 있는 시그널의 연장 고점 ≡ 다리 고점(legHighOf)", () => {
        for (const pointMin of [555, 560, 561, 575, 590, 601, 610]) {
            const s = sliceOutcome(walkOutcome(grid, pointMin), 2, CLOSE);
            const leg = legHighOf(grid, pointMin)!;
            expect(s.status).toBe("exceeded"); // zigzag 준수 격자에선 첫 눌림 깊이 ≥ 2 라 T=2 는 항상 초과
            expect(s.extHighMin).toBe(leg.pivot.min);
            expect(s.extHighPrice).toBe(leg.pivot.price);
        }
    });

    it("초과 판정은 깊이 ≥ T 다 — 경계값 T=3.0 은 깊이 3.0 눌림에서 걸린다", () => {
        const s = sliceOutcome(walkOutcome(grid, 555), 3, CLOSE);
        expect(s.status).toBe("exceeded");
        expect(s.extHighMin).toBe(560);
        expect(s.lowMin).toBe(565);
        expect(s.recovered).toBe(true); // 세션 최고가 11800 > 10000 — 그 후 재돌파 있었음
    });

    it("T 를 올리면 연장 고점이 다음 breakpoint 의 고점으로 뛴다", () => {
        const s = sliceOutcome(walkOutcome(grid, 555), 3.5, CLOSE);
        expect(s.status).toBe("exceeded");
        expect(s.extHighPrice).toBe(11000);
        expect(s.dropFromHighPct).toBeCloseTo(-5, 10);
        expect(s.dropFromClosePct).toBeCloseTo(((10450 - CLOSE) / CLOSE) * 100, 10);
        expect(s.extPct).toBeCloseTo(((11000 - CLOSE) / CLOSE) * 100, 10);
    });

    it("이내(contained) — 연장 고점 = 세션 최고가(정확, 하한 아님), 저가 = T 이내 최대 눌림", () => {
        const s = sliceOutcome(walkOutcome(grid, 555), 5.1, CLOSE);
        expect(s.status).toBe("contained");
        expect(s.extHighMin).toBe(630);
        expect(s.extHighPrice).toBe(11800); // 마지막 확정 고점(11500)이 아니라 세션 최고가
        expect(s.lowMin).toBe(605); // 최대 눌림(5.0%)의 저가
        expect(s.dropFromHighPct).toBeCloseTo(-5, 10);
        expect(s.recovered).toBe(true); // 11800 > 11000(그 눌림의 직전 고점)
    });

    it("무눌림(none) — 연장 고점 = 세션 최고가, 저가류·회복은 null(무사건)", () => {
        const s = sliceOutcome(walkOutcome(grid, 621), 5, CLOSE);
        expect(s.status).toBe("none");
        expect(s.extHighPrice).toBe(11800);
        expect(s.lowMin).toBeNull();
        expect(s.dropFromHighPct).toBeNull();
        expect(s.recovered).toBeNull();
    });

    it("미회복 — 마지막 눌림 후 그 고가를 못 넘고 마감이면 recovered=false, 세션 최고가 = 그 고점", () => {
        // H1 560@10000 → L1 565@9500(5%) 후 회복 없이 마감: 세션 최고가 = H1 자체.
        const g = gridOf([hi(560, 10000), lo(565, 9500)], { min: 560, price: 10000 });
        const s = sliceOutcome(walkOutcome(g, 555), 2, CLOSE);
        expect(s.status).toBe("exceeded");
        expect(s.extHighPrice).toBe(10000);
        expect(s.recovered).toBe(false); // 10000 > 10000 아님 — 재돌파 없음
        const contained = sliceOutcome(walkOutcome(g, 555), 6, CLOSE);
        expect(contained.status).toBe("contained");
        expect(contained.extHighPrice).toBe(10000); // 세션 최고가 = 마지막 고가(꼬리 없음)
        expect(contained.recovered).toBe(false);
    });

    it("브루트포스 대조 — 압축 목록의 답 = 저점 전체를 순서대로 훑은 '깊이 ≥ T 첫 저점'", () => {
        const w = walkOutcome(grid, 555);
        const pairs: { depth: number; highMin: number }[] = [];
        for (let i = 0; i < grid.pivots.length; i += 2) {
            const h = grid.pivots[i];
            const l = grid.pivots[i + 1];
            pairs.push({ depth: ((h.price - l.price) / h.price) * 100, highMin: h.min });
        }
        for (const t of [2, 2.5, 3, 3.01, 4, 5, 5.01, 10]) {
            const brute = pairs.find((p) => p.depth >= t);
            const s = sliceOutcome(w, t, CLOSE);
            if (brute) {
                expect(s.status).toBe("exceeded");
                expect(s.extHighMin).toBe(brute.highMin);
            } else {
                expect(s.status).toBe("contained");
                expect(s.extHighMin).toBe(630); // 세션 최고가 봉
            }
        }
    });
});

describe("Δ 연장폭(= 두 단면의 extPct 차) — 전부 정확", () => {
    const delta = (w: OutcomeWalk, t1: number, t2: number): number =>
        sliceOutcome(w, t2, CLOSE).extPct - sliceOutcome(w, t1, CLOSE).extPct;

    it("둘 다 이내면 정확히 0(같은 세션 최고가)", () => {
        expect(delta(walkOutcome(grid, 555), 6, 10)).toBe(0);
    });

    it("T1 초과·T2 초과 — 두 단면의 연장 고점 % 차", () => {
        expect(delta(walkOutcome(grid, 555), 2, 4)).toBeCloseTo(((11000 - 10000) / CLOSE) * 100, 10);
    });

    it("T1 초과·T2 이내 — 세션 최고가 기준 정확값(옛 하한이 아니다)", () => {
        expect(delta(walkOutcome(grid, 555), 2, 6)).toBeCloseTo(((11800 - 10000) / CLOSE) * 100, 10);
    });
});
