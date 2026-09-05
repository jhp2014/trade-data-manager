// outcome — 결과 걷기(breakpoint 압축)와 T 단면(상태 3종·회복·세션 최고가)을 격자 리터럴로 못 박는다.
// 규칙: decisions.md "시그널 결과".
import { describe, expect, it } from "vitest";
import type { GridPivot, PointGrid } from "../grid.js";
import { sliceOutcome, walkOutcome, type OutcomeSignal, type OutcomeWalk } from "../outcome.js";
import { legHighOf } from "../windows.js";

/** 시그널 좌표 — high 는 연장 상한 폴백과 품는 쌍의 연장 좌표(cap) 재료다(상단 돌파 위치에선 미사용). */
const pt = (min: number, high = 0): OutcomeSignal => ({ min, high });

// v9 경로 뷰 유효성: 레벨(첫 레벨 제외)엔 cross 를 채운다(불변식 ④ — levelViewOf 의 구간 경계).
const hi = (min: number, price: number, cross: number | null = null): GridPivot => ({
    kind: "high",
    min,
    price,
    confirmedMin: min + 1,
    cum: "0",
    cross: cross === null ? null : { min: cross, tv: "0", cum: "0" },
});
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: min + 1, cum: "0", cross: null });
const gridOf = (pivots: GridPivot[], sessionHigh: { min: number; price: number }): PointGrid =>
    ({ base: null, touch: null, pivots, newHighs: [], prevBase: null, prevBaseKrx: null, sessionHigh });

// 세션(zigzag 2% 준수 — 저점 깊이 전부 ≥ 2%):
//   H1 560 @10000 → L1 565 @9700  (깊이 3.0%)
//   H2 580 @10500 → L2 585 @10250 (깊이 ~2.38% — 러닝 최대 미만이라 breakpoint 아님)
//   H3 600 @11000 → L3 605 @10450 (깊이 5.0%)
//   H4 620 @11500 → L4 625 @11270 (깊이 2.0% — 경계값, breakpoint 아님)
//   꼬리: L4 회복 후 상승 마감 — 세션 최고가 11800(@630, 미확정이라 피벗엔 없음).
const PIVOTS = [hi(560, 10000), lo(565, 9700), hi(580, 10500, 578), lo(585, 10250), hi(600, 11000, 598), lo(605, 10450), hi(620, 11500, 618), lo(625, 11270)];
const grid = gridOf(PIVOTS, { min: 630, price: 11800 });
const CLOSE = 9800;

describe("walkOutcome — breakpoint 러닝-최대 압축", () => {
    it("깊이의 러닝 최대만 남는다(3.0 → 5.0), 세션 최고가가 실린다", () => {
        const w = walkOutcome(grid, pt(555));
        expect(w.breaks.map((b) => [Math.round(b.depth * 100) / 100, b.highMin, b.lowMin])).toEqual([
            [3, 560, 565],
            [5, 600, 605],
        ]);
        expect(w.sessionHigh).toEqual({ min: 630, price: 11800 });
    });

    it("시그널 뒤에서 시작한 걷기는 그 뒤 사이클만 본다", () => {
        const w = walkOutcome(grid, pt(590));
        expect(w.breaks.map((b) => b.highMin)).toEqual([600]); // 깊이 5.0 하나(뒤의 2.0 은 미만)
    });

    it("시그널 후 눌림 사건이 없으면 breaks 빈 배열 — 결손이 아니라 무눌림(세션 최고가는 그대로)", () => {
        const w = walkOutcome(grid, pt(626)); // 마지막 저점(625) 이후 — 구간 안 눌림도 없다
        expect(w.breaks).toEqual([]);
        expect(w.sessionHigh.price).toBe(11800);
    });

    it("구간 안 시그널(밴드 Point 자리)은 p 이후의 그 구간 눌림을 첫 후보로 본다 — 옛 걷기의 낙관 제거(§10.4)", () => {
        // p=621: 레벨 쌍4(620@11500, 크로싱 없음 = 세션 끝) 구간 안. p 이후 저점 625(11270)가
        // 깊이 2.0%(기준 고점 = 레벨 11500)로 선다 — v8 걷기는 high.min ≥ p 만 봐서 이 눌림을 놓쳤다.
        const w = walkOutcome(grid, pt(621));
        expect(w.breaks.map((b) => [Math.round(b.depth * 100) / 100, b.highMin, b.lowMin])).toEqual([[2, 620, 625]]);
        expect(w.sessionHigh.price).toBe(11800);
    });

    it("밴드 Point 직후 깊은 눌림 — 깊이·회복 자는 레벨, 연장 고점은 p 이후 좌표(cap)로 갈린다", () => {
        // p=582(고가 10,460 — 밴드 접근 봉): 레벨 쌍2(580@10500, 크로싱 598) 구간 안. p 이후 저점
        // 585(10250) → 깊이 2.381%(분모 = 레벨 10,500 — 트레일링은 이미 선 최고가 기준). 연장 고점은
        // 레벨 봉(580, p 이전!)이 아니라 cap = 시그널 봉 자신(§10.4 — 과거 고가가 연장으로 새면 Δ 가 음수가 된다).
        const w = walkOutcome(grid, pt(582, 10460));
        expect(w.breaks.map((b) => [Math.round(b.depth * 1000) / 1000, b.highMin, b.lowMin, b.capMin ?? null])).toEqual([
            [2.381, 580, 585, 582],
            [5, 600, 605, null],
        ]);
        const s = sliceOutcome(w, 2.2, CLOSE);
        expect(s).toMatchObject({ status: "exceeded", extHighMin: 582, extHighPrice: 10460, lowMin: 585, dropFromHighPct: -((10500 - 10250) / 10500) * 100 });
        expect(sliceOutcome(w, 3, CLOSE)).toMatchObject({ extHighMin: 600, extHighPrice: 11000 });
        // Δ 비단조 회귀선: T 를 올려도 연장 고점 %(extPct)가 줄지 않는다(cap ≤ 뒤 레벨 ≤ 세션 최고가).
        const exts = [2.2, 3, 5.1].map((t) => sliceOutcome(w, t, CLOSE).extPct);
        expect(exts[0]).toBeLessThanOrEqual(exts[1]);
        expect(exts[1]).toBeLessThanOrEqual(exts[2]);
    });

    it("세션 최고가가 시그널 이전이면 연장 상한은 p 이후 경로 뷰 고점(없으면 시그널 봉 자신)으로 갈음한다", () => {
        // p=640(모든 피벗 뒤): p 이후 고점 피벗이 없어 폴백 = 시그널 봉 고가 11,400 — 과거 11,800 이 새지 않는다.
        const w = walkOutcome(grid, pt(640, 11400));
        expect(w.breaks).toEqual([]);
        expect(w.sessionHigh).toEqual({ min: 640, price: 11400 });
        expect(sliceOutcome(w, 2, 11300)).toMatchObject({ status: "none", extHighPrice: 11400 });
    });
});

describe("sliceOutcome — T 단면(상태 3종, 전부 정확값)", () => {
    it("T=2 특수해 — **상단 돌파 위치** 시그널의 연장 고점 ≡ 다리 고점(legHighOf)", () => {
        // 동치는 상단 돌파 Point 에만(§10.4) — 구간 안(밴드 Point 자리) 시그널은 품는 쌍의 눌림이 먼저라
        // 걷기 결과가 legHighOf 보다 정확하다. 후보 = 레벨 봉·크로싱 봉·세션 시작 등 구간 밖 위치들.
        for (const pointMin of [555, 560, 578, 598, 618]) {
            const s = sliceOutcome(walkOutcome(grid, pt(pointMin)), 2, CLOSE);
            const leg = legHighOf(grid, pointMin)!;
            expect(s.status).toBe("exceeded"); // zigzag 준수 격자에선 첫 눌림 깊이 ≥ 2 라 T=2 는 항상 초과
            expect(s.extHighMin).toBe(leg.pivot.min);
            expect(s.extHighPrice).toBe(leg.pivot.price);
        }
    });

    it("초과 판정은 깊이 ≥ T 다 — 경계값 T=3.0 은 깊이 3.0 눌림에서 걸린다", () => {
        const s = sliceOutcome(walkOutcome(grid, pt(555)), 3, CLOSE);
        expect(s.status).toBe("exceeded");
        expect(s.extHighMin).toBe(560);
        expect(s.lowMin).toBe(565);
        expect(s.recovered).toBe(true); // 세션 최고가 11800 > 10000 — 그 후 재돌파 있었음
    });

    it("T 를 올리면 연장 고점이 다음 breakpoint 의 고점으로 뛴다", () => {
        const s = sliceOutcome(walkOutcome(grid, pt(555)), 3.5, CLOSE);
        expect(s.status).toBe("exceeded");
        expect(s.extHighPrice).toBe(11000);
        expect(s.dropFromHighPct).toBeCloseTo(-5, 10);
        expect(s.dropFromClosePct).toBeCloseTo(((10450 - CLOSE) / CLOSE) * 100, 10);
        expect(s.extPct).toBeCloseTo(((11000 - CLOSE) / CLOSE) * 100, 10);
    });

    it("이내(contained) — 연장 고점 = 세션 최고가(정확, 하한 아님), 저가 = T 이내 최대 눌림", () => {
        const s = sliceOutcome(walkOutcome(grid, pt(555)), 5.1, CLOSE);
        expect(s.status).toBe("contained");
        expect(s.extHighMin).toBe(630);
        expect(s.extHighPrice).toBe(11800); // 마지막 확정 고점(11500)이 아니라 세션 최고가
        expect(s.lowMin).toBe(605); // 최대 눌림(5.0%)의 저가
        expect(s.dropFromHighPct).toBeCloseTo(-5, 10);
        expect(s.recovered).toBe(true); // 11800 > 11000(그 눌림의 직전 고점)
    });

    it("무눌림(none) — 연장 고점 = 세션 최고가, 저가류·회복은 null(무사건)", () => {
        const s = sliceOutcome(walkOutcome(grid, pt(626)), 5, CLOSE); // 마지막 저점(625) 이후 — 눌림 사건 0
        expect(s.status).toBe("none");
        expect(s.extHighPrice).toBe(11800);
        expect(s.lowMin).toBeNull();
        expect(s.dropFromHighPct).toBeNull();
        expect(s.recovered).toBeNull();
    });

    it("미회복 — 마지막 눌림 후 그 고가를 못 넘고 마감이면 recovered=false, 세션 최고가 = 그 고점", () => {
        // H1 560@10000 → L1 565@9500(5%) 후 회복 없이 마감: 세션 최고가 = H1 자체.
        const g = gridOf([hi(560, 10000), lo(565, 9500)], { min: 560, price: 10000 });
        const s = sliceOutcome(walkOutcome(g, pt(555)), 2, CLOSE);
        expect(s.status).toBe("exceeded");
        expect(s.extHighPrice).toBe(10000);
        expect(s.recovered).toBe(false); // 10000 > 10000 아님 — 재돌파 없음
        const contained = sliceOutcome(walkOutcome(g, pt(555)), 6, CLOSE);
        expect(contained.status).toBe("contained");
        expect(contained.extHighPrice).toBe(10000); // 세션 최고가 = 마지막 고가(꼬리 없음)
        expect(contained.recovered).toBe(false);
    });

    it("브루트포스 대조 — 압축 목록의 답 = 저점 전체를 순서대로 훑은 '깊이 ≥ T 첫 저점'", () => {
        const w = walkOutcome(grid, pt(555));
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
        expect(delta(walkOutcome(grid, pt(555)), 6, 10)).toBe(0);
    });

    it("T1 초과·T2 초과 — 두 단면의 연장 고점 % 차", () => {
        expect(delta(walkOutcome(grid, pt(555)), 2, 4)).toBeCloseTo(((11000 - 10000) / CLOSE) * 100, 10);
    });

    it("T1 초과·T2 이내 — 세션 최고가 기준 정확값(옛 하한이 아니다)", () => {
        expect(delta(walkOutcome(grid, pt(555)), 2, 6)).toBeCloseTo(((11800 - 10000) / CLOSE) * 100, 10);
    });
});
