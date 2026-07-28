import { describe, it, expect } from "vitest";
import { buildAxisIndex, countPlacedByPoint, placementsOf, type AxisIndex } from "../rankIndex.js";
import { pointKey } from "../pointKey.js";
import type { PlacedPoint, RankAxis } from "@trade-data-manager/wire";

const pp = (code: string, orderKey: number, slotId: string, time = "10:00:00"): PlacedPoint => ({ stockCode: code, date: "2026-07-01", time, slotId, orderKey });
const ref = (code: string, time = "10:00:00") => ({ stockCode: code, date: "2026-07-01", time });
const axis = (id: string, name = id): RankAxis => ({ id, name, scope: "point" });

describe("buildAxisIndex", () => {
    it("강=큰 orderKey → rank 1, frac 1. 약=작은 orderKey → rank total, frac 0.", () => {
        const idx = buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2"), pp("C", 30, "s3")]);
        expect(idx.get(pointKey(ref("C")))).toMatchObject({ rank: 1, total: 3, frac: 1 });
        expect(idx.get(pointKey(ref("B")))).toMatchObject({ rank: 2, total: 3, frac: 0.5 });
        expect(idx.get(pointKey(ref("A")))).toMatchObject({ rank: 3, total: 3, frac: 0 });
    });

    it("동점(같은 slot) = 같은 rank, 다음 rank 는 건너뛴다(경쟁순위).", () => {
        // B·C 동점(같은 slot, 같은 orderKey=20). D 가 가장 강(30).
        const idx = buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2"), pp("C", 20, "s2", "10:05:00"), pp("D", 30, "s3")]);
        const at = (code: string, time = "10:00:00"): number => idx.get(pointKey(ref(code, time)))!.rank;
        expect(at("D")).toBe(1);
        expect(at("B")).toBe(2);
        expect(at("C", "10:05:00")).toBe(2); // 동점
        expect(at("A")).toBe(4); // 더 강한 타점 수(D,B,C=3) + 1
    });

    it("빈 라인 → 빈 인덱스.", () => {
        expect(buildAxisIndex([]).size).toBe(0);
    });
});

describe("countPlacedByPoint", () => {
    it("타점이 꽂힌 축 수를 센다(미배치 타점은 키 자체가 없음).", () => {
        const indexByAxis = new Map<string, AxisIndex>([
            ["ax1", buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2")])],
            ["ax2", buildAxisIndex([pp("A", 5, "t1")])],
            ["ax3", buildAxisIndex([])], // 빈 축은 아무 타점도 안 셈
        ]);
        const counts = countPlacedByPoint(indexByAxis);
        expect(counts.get(pointKey(ref("A")))).toBe(2);
        expect(counts.get(pointKey(ref("B")))).toBe(1);
        expect(counts.get(pointKey(ref("C")))).toBeUndefined();
    });
});

describe("placementsOf", () => {
    const axes = [axis("ax1", "속도"), axis("ax2", "매물대"), axis("ax3", "수급")];

    it("배치된 축은 강한 순(frac 내림차순) — 축마다 분모가 달라도 비교된다. 미배치는 축 순서 그대로.", () => {
        // ax1: A 가 3개 중 최약(frac 0) / ax2: A 가 2개 중 최강(frac 1)
        const indexByAxis = new Map<string, AxisIndex>([
            ["ax1", buildAxisIndex([pp("A", 10, "s1"), pp("B", 20, "s2"), pp("C", 30, "s3")])],
            ["ax2", buildAxisIndex([pp("A", 30, "t2"), pp("B", 10, "t1")])],
            ["ax3", buildAxisIndex([pp("B", 10, "u1")])], // A 는 여기 미배치
        ]);
        const got = placementsOf(ref("A"), axes, indexByAxis);
        expect(got.placed.map((g) => g.axisName)).toEqual(["매물대", "속도"]); // frac 1 → 0
        expect(got.placed[0].cell).toMatchObject({ rank: 1, total: 2 });
        expect(got.placed[1].cell).toMatchObject({ rank: 3, total: 3 });
        expect(got.unplaced.map((a) => a.name)).toEqual(["수급"]);
    });

    it("어디에도 안 꽂힌 타점은 전 축이 미배치.", () => {
        const got = placementsOf(ref("Z"), axes, new Map());
        expect(got.placed).toEqual([]);
        expect(got.unplaced).toHaveLength(3);
    });
});
