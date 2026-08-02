import { describe, it, expect } from "vitest";
import { activeValueAxisIds, makeAxisValuePredicate, resolveBound, resolveRanges, type AxisValues } from "../axisValueFilter.js";
import type { AxisValueRange } from "../../../store/rankFilterSlice.js";

const A = "c:daily-change-un";
const B = "c:other";

// 타점키 → 수치.
const values = (entries: [string, number][]): Map<string, number> => new Map(entries);
const axisValues = (entries: [string, Map<string, number>][]): AxisValues => new Map(entries);

const va = values([["p1", 1], ["p2", 5], ["p3", 12]]);

describe("resolveBound", () => {
    it("타점 앵커는 그 타점의 현재 값으로 풀린다", () => {
        expect(resolveBound({ kind: "point", point: "p2" }, va)).toBe(5);
    });
    it("값 경계는 그대로", () => {
        expect(resolveBound({ kind: "value", value: 7.5 }, va)).toBe(7.5);
    });
    it("사라진 앵커는 null", () => {
        expect(resolveBound({ kind: "point", point: "gone" }, va)).toBeNull();
    });
});

describe("resolveRanges", () => {
    it("반열림은 ±Infinity 로 채운다", () => {
        expect(resolveRanges([{ from: { kind: "point", point: "p2" } }], va)).toEqual([{ from: 5, to: Infinity }]);
        expect(resolveRanges([{ to: { kind: "point", point: "p2" } }], va)).toEqual([{ from: -Infinity, to: 5 }]);
    });
    it("양끝이 뒤집혀 있어도 정렬해서 돌려준다", () => {
        const r: AxisValueRange = { from: { kind: "value", value: 12 }, to: { kind: "value", value: 3 } };
        expect(resolveRanges([r], va)).toEqual([{ from: 3, to: 12 }]);
    });
    it("앵커가 사라진 구간만 버린다(축 전체를 열지 않는다)", () => {
        const rs: AxisValueRange[] = [
            { from: { kind: "point", point: "gone" }, to: { kind: "point", point: "p3" } },
            { from: { kind: "point", point: "p1" }, to: { kind: "point", point: "p2" } },
        ];
        expect(resolveRanges(rs, va)).toEqual([{ from: 1, to: 5 }]);
    });
    it("양끝이 다 없는 구간은 무시", () => {
        expect(resolveRanges([{}], va)).toEqual([]);
    });
});

describe("makeAxisValuePredicate", () => {
    it("구간이 없으면 전부 통과", () => {
        const ok = makeAxisValuePredicate({}, axisValues([[A, va]]));
        expect(ok("p1")).toBe(true);
    });

    it("한 축 안 구간끼리는 OR", () => {
        const ranges: AxisValueRange[] = [
            { from: { kind: "value", value: 0 }, to: { kind: "value", value: 2 } },
            { from: { kind: "value", value: 10 }, to: { kind: "value", value: 20 } },
        ];
        const ok = makeAxisValuePredicate({ [A]: ranges }, axisValues([[A, va]]));
        expect([ok("p1"), ok("p2"), ok("p3")]).toEqual([true, false, true]);
    });

    it("축끼리는 AND", () => {
        const vb = values([["p1", 100], ["p2", 100], ["p3", 0]]);
        const ok = makeAxisValuePredicate(
            {
                [A]: [{ from: { kind: "value", value: 0 } }],          // 전부 통과
                [B]: [{ from: { kind: "value", value: 50 } }],         // p3 탈락
            },
            axisValues([[A, va], [B, vb]]),
        );
        expect([ok("p1"), ok("p3")]).toEqual([true, false]);
    });

    it("그 축에 값이 없는 타점(결손)은 탈락", () => {
        const ok = makeAxisValuePredicate({ [A]: [{ from: { kind: "value", value: 0 } }] }, axisValues([[A, va]]));
        expect(ok("없는타점")).toBe(false);
    });

    it("앵커가 다 사라져 구간이 하나도 안 풀리면 그 축은 비활성(전부 통과)", () => {
        const ok = makeAxisValuePredicate({ [A]: [{ from: { kind: "point", point: "gone" } }] }, axisValues([[A, va]]));
        expect(ok("p1")).toBe(true);
        expect(activeValueAxisIds({ [A]: [{ from: { kind: "point", point: "gone" } }] }, axisValues([[A, va]]))).toEqual([]);
    });

    it("수식이 바뀌어 값이 움직여도 앵커 경계는 함께 움직인다", () => {
        const ranges: AxisValueRange[] = [{ from: { kind: "point", point: "p2" } }]; // "p2 이상"
        const before = makeAxisValuePredicate({ [A]: ranges }, axisValues([[A, va]]));
        expect([before("p1"), before("p2"), before("p3")]).toEqual([false, true, true]);

        // 축을 다시 구워 값이 전부 두 배가 됐다 — 순서는 그대로.
        const after = makeAxisValuePredicate({ [A]: ranges }, axisValues([[A, values([["p1", 2], ["p2", 10], ["p3", 24]])]]));
        expect([after("p1"), after("p2"), after("p3")]).toEqual([false, true, true]);
    });
});
