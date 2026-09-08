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
    // 걷기 층 소유(T 무관) — 사건당 하나. 위 walkOf 의 깊이들과 같아야 한다.
    breakDepths: [5.45, 8.33, 3],
};

const A_KEY = "A|2026-07-06|09:30:00";
const B_KEY = "B|2026-07-06|09:31:00";
const C_KEY = "C|2026-07-06|09:32:00";

describe("buildOutcomesView — 기준 = 그 단면의 허용 폭 T, 값 전부 정확(세션 최고가)", () => {
    const v = buildOutcomesView(walks, 4);
    const A = v.byKey.get(A_KEY)!;
    const B = v.byKey.get(B_KEY)!;
    const C = v.byKey.get(C_KEY)!;

    it("상태 3분류(T=4) — A 초과(5.45 ≥ 4) · B 이내(3 < 4) · C 무눌림", () => {
        expect(v.counts).toEqual({ total: 3, exceeded: 1, contained: 1, none: 1 });
    });

    it("초과 행 — 술어값 3종 전부, 레일 값 맵에도 선다", () => {
        expect(A.eval.extHigh).toBeCloseTo(10, 10); // T=4 → 깊이 5.45 눌림의 직전 고점 110
        expect(A.eval.dropFromHigh).toBeCloseTo(-5.45, 10);
        expect(A.eval.dropFromClose).toBeCloseTo(4, 10); // 저가 104 vs 종가 100
        expect(v.railValues.get("extHigh")!.has(A_KEY)).toBe(true);
        expect(v.railValues.get("dropFromHigh")!.has(A_KEY)).toBe(true);
    });

    it("이내 행 — 연장 고점 = 세션 최고가(정확), 낙폭 = T 이내 최대 눌림(정확) — 술어·레일에 **있다**", () => {
        expect(B.slice.status).toBe("contained");
        expect(B.eval.extHigh).toBeCloseTo(30, 10); // 세션 최고가 130
        expect(B.eval.dropFromHigh).toBeCloseTo(-3, 10);
        expect(v.railValues.get("extHigh")!.has(B_KEY)).toBe(true);
        expect(v.railValues.get("dropFromHigh")!.has(B_KEY)).toBe(true);
    });

    it("무눌림 행 — 연장 고점은 있고(세션 최고가) 낙폭 2종만 없다(무사건)", () => {
        expect(C.slice.status).toBe("none");
        expect(C.eval.extHigh).toBeCloseTo(50, 10);
        expect(C.eval.dropFromHigh).toBeUndefined();
        expect(v.railValues.get("extHigh")!.has(C_KEY)).toBe(true);
        expect(v.railValues.get("dropFromHigh")!.has(C_KEY)).toBe(false);
    });

    it("회복 카운트 — A 회복(140 > 110) · B 미회복(130 = 130) · C 는 제외(저가 없음)", () => {
        expect(v.recovery).toEqual({ recovered: 1, unrecovered: 1 });
        expect(A.slice.recovered).toBe(true);
        expect(B.slice.recovered).toBe(false);
        expect(C.slice.recovered).toBeNull();
    });

    it("**T 를 넓히면 같은 시그널의 연장 고점이 커진다** — 옛 Δ 지표가 하던 비교를 인스턴스 둘이 진다", () => {
        // T=4 에선 깊이 5.45 눌림에서 끊겨 직전 고점 110, T=8 이면 그 눌림이 흡수돼 120 까지 이어진다.
        expect(A.eval.extHigh).toBeCloseTo(10, 10);
        expect(buildOutcomesView(walks, 8).byKey.get(A_KEY)!.eval.extHigh).toBeCloseTo(20, 10);
        // 세션 최고가로 끝난 행은 T 를 넓혀도 그대로(더 갈 곳이 없다).
        expect(buildOutcomesView(walks, 8).byKey.get(B_KEY)!.eval.extHigh).toBeCloseTo(30, 10);
    });
});
