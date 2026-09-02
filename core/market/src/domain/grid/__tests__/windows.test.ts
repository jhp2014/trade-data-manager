// windows — 누적 스냅샷에서 창을 파생하는 규칙과, 시그널→다리 고점 대응을 격자 리터럴로 못 박는다.
import { describe, expect, it } from "vitest";
import type { GridBarMark, GridPivot, PointGrid } from "../grid.js";
import { amountFrom, breakoutAmountOf, legAmountOf, legHighOf, legStartOf, legWindowOf, renewalAmountOf } from "../windows.js";

const mark = (min: number, tv: number, cum: number): GridBarMark => ({ min, tv: String(tv), cum: String(cum) });
const hi = (min: number, price: number, cum: number, cross: GridBarMark | null, confirmedMin = min + 1): GridPivot => ({ kind: "high", min, price, confirmedMin, cum: String(cum), cross });
const lo = (min: number, price: number, cum: number): GridPivot => ({ kind: "low", min, price, confirmedMin: null, cum: String(cum), cross: null });
const gridOf = (partial: Partial<PointGrid>): PointGrid => ({ base: 10000, touch: mark(550, 10, 100), pivots: [], newHighs: [], prevBase: null, prevBaseKrx: null, ...partial });

// 세션: 터치 550(누적 100) → 고점 H1 560(누적 300, 첫 고점) → 저점 565(누적 400) → 크로싱 570(tv 50, 누적 450)
//       → 고점 H2 580(누적 700) → 저점 585(누적 800) → 크로싱 590(tv 30, 누적 830) → 고점 H3 600(누적 1000) → 저점 605(누적 1100)
const grid = gridOf({
    pivots: [hi(560, 10300, 300, null), lo(565, 10100, 400), hi(580, 10600, 700, mark(570, 50, 450)), lo(585, 10400, 800), hi(600, 10900, 1000, mark(590, 30, 830)), lo(605, 10700, 1100)],
});

describe("windows — 창 파생", () => {
    it("amountFrom — 포함 창 = 끝.cum − 시작.cum + 시작.tv", () => {
        expect(amountFrom(mark(570, 50, 450), "700")).toBe("300"); // 570 봉(50) 포함 ~ 580 봉
    });

    it("legAmountOf — 직전 피벗 다음 봉부터 이 피벗까지, 첫 피벗은 세션 첫 봉부터", () => {
        expect(legAmountOf(grid, 0)).toBe("300");
        expect(legAmountOf(grid, 1)).toBe("100");
        expect(legAmountOf(grid, 2)).toBe("300");
    });

    it("renewalAmountOf — 크로싱 봉 포함 ~ 고점, 첫 고점·저점은 null, 불변식 0 < renewal ≤ leg", () => {
        expect(renewalAmountOf(grid, 0)).toBeNull();
        expect(renewalAmountOf(grid, 1)).toBeNull();
        expect(renewalAmountOf(grid, 2)).toBe("300"); // = leg(등호 경계: 저점 직후가 곧 크로싱)
        expect(renewalAmountOf(grid, 4)).toBe("200"); // 1000 − 830 + 30(크로싱 봉 자신 포함)
        for (const i of [2, 4]) {
            const r = BigInt(renewalAmountOf(grid, i)!);
            expect(r > 0n && r <= BigInt(legAmountOf(grid, i))).toBe(true);
        }
    });

    it("breakoutAmountOf — 터치 봉 포함 ~ 고점, 미터치·터치가 고점 뒤면 null", () => {
        expect(breakoutAmountOf(grid, 0)).toBe("210"); // 300 − 100 + 10
        expect(breakoutAmountOf(grid, 1)).toBeNull();
        expect(breakoutAmountOf(gridOf({ ...grid, touch: null }), 0)).toBeNull();
        expect(breakoutAmountOf(gridOf({ ...grid, touch: mark(575, 1, 1) }), 0)).toBeNull();
    });
});

describe("windows — 시그널 → 다리 고점", () => {
    it("legHighOf — 시그널 이후 첫 확정 고점, 시그널 봉 자신이 고점이면 그 봉, 없으면 null(꼬리)", () => {
        expect(legHighOf(grid, 555)?.pivot.min).toBe(560);
        expect(legHighOf(grid, 560)?.pivot.min).toBe(560);
        expect(legHighOf(grid, 561)?.pivot.min).toBe(580);
        expect(legHighOf(grid, 601)).toBeNull();
    });

    it("legStartOf — 돌파(레벨 0)는 터치 봉, 재돌파는 레벨 피벗 다음 확정 고점의 cross", () => {
        expect(legStartOf(grid, { levelIdx: 0, levelMin: null })).toEqual(mark(550, 10, 100));
        expect(legStartOf(grid, { levelIdx: 1, levelMin: 560 })).toEqual(mark(570, 50, 450));
        expect(legStartOf(grid, { levelIdx: 2, levelMin: 580 })).toEqual(mark(590, 30, 830));
        expect(legStartOf(grid, { levelIdx: 3, levelMin: 600 })).toBeNull(); // 다음 고점 아직 없음(꼬리)
    });

    it("legWindowOf — 돌파 시그널 555 의 다리 = 터치 550 → H1 560", () => {
        expect(legWindowOf(grid, { min: 555, levelIdx: 0, levelMin: null })).toEqual({
            start: mark(550, 10, 100),
            high: grid.pivots[0],
            amount: "210",
            minutes: 10,
        });
    });

    it("legWindowOf — 재돌파 시그널(레벨 H1, 봉 575)의 다리 = 크로싱 570 → H2 580, 저대금 크로싱~Point 사이가 창에 섞인다(의도)", () => {
        expect(legWindowOf(grid, { min: 575, levelIdx: 1, levelMin: 560 })).toEqual({
            start: mark(570, 50, 450),
            high: grid.pivots[2],
            amount: "300",
            minutes: 10,
        });
    });

    it("legWindowOf — 시그널 봉이 곧 고점 봉이면 창 끝 = 시작이 될 수 있다(minutes 0)", () => {
        const g = gridOf({ pivots: [hi(560, 10300, 300, null), lo(565, 10100, 400), hi(570, 10600, 450, mark(570, 50, 450)), lo(575, 10400, 500)] });
        expect(legWindowOf(g, { min: 570, levelIdx: 1, levelMin: 560 })).toMatchObject({ amount: "50", minutes: 0 });
    });

    it("legWindowOf — 병합으로 시그널 레벨이 L 이고 다리 고점이 L 다음 고점을 지나쳐도 시작은 L 의 크로싱(다음 고점의 cross)", () => {
        // 레벨 L = H1(560). H2(580)는 병합된 잔 고점, 시그널은 H2 를 넘은 595 봉 → 다리 고점 = H3(600). 시작 = H2.cross(570).
        expect(legWindowOf(grid, { min: 595, levelIdx: 1, levelMin: 560 })).toEqual({
            start: mark(570, 50, 450),
            high: grid.pivots[4],
            amount: "600", // 1000 − 450 + 50
            minutes: 30,
        });
    });

    it("legWindowOf — 꼬리 시그널(확정 고점 없음)은 null(결손)", () => {
        expect(legWindowOf(grid, { min: 601, levelIdx: 3, levelMin: 600 })).toBeNull();
    });

    it("시그널 둘이 같은 다리 고점을 공유하지 않는다 — 고점 사이엔 시그널이 최대 하나(≤1:1)", () => {
        // 같은 다리(560, 580) 사이의 두 시각은 같은 고점을 가리키지만, 실제 pointsOf 는 그 사이에 Point 를 둘 만들 수 없다
        // (새 레벨은 확정 고점에서만 선다). 헬퍼는 그 전제를 믿고 첫 고점만 돌려준다.
        expect(legHighOf(grid, 570)?.pivot.min).toBe(580);
        expect(legHighOf(grid, 575)?.pivot.min).toBe(580);
    });
});
