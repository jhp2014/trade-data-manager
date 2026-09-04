// buildOutcomesView — 상태 3분류(초과/이내/무눌림)·회복 카운트·값 맵(전부 정확)을 순수 조립 함수로 직접 잰다.
import { describe, expect, it } from "vitest";
import type { OutcomeWalk } from "@trade-data-manager/market/domain";
import { buildOutcomesView, type OutcomeWalksView } from "../useOutcomes.js";

/** (깊이, 고점가, 저가) 쌍들로 walk 리터럴 — breakpoint 는 이미 러닝-최대 접두라고 가정(walkOutcome 이 보장). */
const walkOf = (breaks: [depth: number, highPrice: number, lowPrice: number][], sessionHighPrice: number): OutcomeWalk => ({
    breaks: breaks.map(([depth, highPrice, lowPrice], i) => ({ depth, highMin: 575 + i * 15, highPrice, lowMin: 580 + i * 15, lowPrice })),
    sessionHigh: { min: 700, price: sessionHighPrice },
});

const CLOSE = 100;

// A: 깊이 5.45 → 8.33, 꼬리 회복(세션 최고가 140 > 마지막 고점 120).
// B: 깊이 3 뿐 — 세션 최고가 = 그 고점(130) = 미회복.
// C: 눌림 없음(무눌림) — 세션 최고가 150.
const walks: OutcomeWalksView = {
    byKey: new Map([
        ["A|2026-07-06|09:30:00", { walk: walkOf([[5.45, 110, 104], [8.33, 120, 110]], 140), close: CLOSE }],
        ["B|2026-07-06|09:31:00", { walk: walkOf([[3, 130, 126.1]], 130), close: CLOSE }],
        ["C|2026-07-06|09:32:00", { walk: walkOf([], 150), close: CLOSE }],
    ]),
    total: 3,
};

const A_KEY = "A|2026-07-06|09:30:00";
const B_KEY = "B|2026-07-06|09:31:00";
const C_KEY = "C|2026-07-06|09:32:00";

describe("buildOutcomesView — 기준 = 기본 허용 T1, 값 전부 정확(세션 최고가)", () => {
    const v = buildOutcomesView(walks, 4, 8);
    const A = v.byKey.get(A_KEY)!;
    const B = v.byKey.get(B_KEY)!;
    const C = v.byKey.get(C_KEY)!;

    it("상태 3분류(T1=4) — A 초과(5.45 ≥ 4) · B 이내(3 < 4) · C 무눌림", () => {
        expect(v.counts).toEqual({ total: 3, exceeded: 1, contained: 1, none: 1 });
    });

    it("초과 행 — 술어값 4종 전부, 레일 값 맵에도 선다", () => {
        expect(A.eval.extHigh).toBeCloseTo(10, 10); // T1=4 → 깊이 5.45 눌림의 직전 고점 110
        expect(A.eval.dropFromHigh).toBeCloseTo(-5.45, 10);
        expect(A.eval.dropFromClose).toBeCloseTo(4, 10); // 저가 104 vs 종가 100
        expect(v.railValues.get("extHigh")!.has(A_KEY)).toBe(true);
        expect(v.railValues.get("dropFromHigh")!.has(A_KEY)).toBe(true);
    });

    it("이내 행 — 연장 고점 = 세션 최고가(정확), 낙폭 = T1 이내 최대 눌림(정확) — 술어·레일에 **있다**", () => {
        expect(B.slice.status).toBe("contained");
        expect(B.eval.extHigh).toBeCloseTo(30, 10); // 세션 최고가 130
        expect(B.eval.dropFromHigh).toBeCloseTo(-3, 10);
        expect(v.railValues.get("extHigh")!.has(B_KEY)).toBe(true);
        expect(v.railValues.get("dropFromHigh")!.has(B_KEY)).toBe(true);
    });

    it("무눌림 행 — 연장 고점·Δ 는 있고(세션 최고가) 낙폭 2종만 없다(무사건)", () => {
        expect(C.slice.status).toBe("none");
        expect(C.eval.extHigh).toBeCloseTo(50, 10);
        expect(C.eval.deltaExt).toBe(0);
        expect(C.eval.dropFromHigh).toBeUndefined();
        expect(v.railValues.get("extHigh")!.has(C_KEY)).toBe(true);
        expect(v.railValues.get("deltaExt")!.has(C_KEY)).toBe(true);
        expect(v.railValues.get("dropFromHigh")!.has(C_KEY)).toBe(false);
    });

    it("회복 카운트 — A 회복(140 > 110) · B 미회복(130 = 130) · C 는 제외(저가 없음)", () => {
        expect(v.recovery).toEqual({ recovered: 1, unrecovered: 1 });
        expect(A.slice.recovered).toBe(true);
        expect(B.slice.recovered).toBe(false);
        expect(C.slice.recovered).toBeNull();
    });

    it("Δ — T1=4→T2=8: A 는 110→120 만큼 연장(정확), B·C 는 0", () => {
        expect(A.eval.deltaExt).toBeCloseTo(10, 10); // (120−110)/100
        expect(B.eval.deltaExt).toBe(0); // 둘 다 세션 최고가
        expect(v.extendedCount).toBe(1);
        expect(v.railValues.get("deltaExt")!.has(A_KEY)).toBe(true);
    });

    it("T 레일 스트립 재료 — 모든 breakpoint 깊이(사건당 하나, T 무관 고정)", () => {
        expect(v.breakDepths.map((d) => Math.round(d * 100) / 100).sort((a, b) => a - b)).toEqual([3, 5.45, 8.33]);
        expect(buildOutcomesView(walks, 9, 20).breakDepths).toEqual(v.breakDepths);
    });
});
