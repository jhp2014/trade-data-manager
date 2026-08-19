import { describe, it, expect } from "vitest";
import { buildAxisIndex, countPlacedByPoint, placementsOf, type AxisIndex } from "../rankIndex.js";
import { pointKey } from "../pointKey.js";
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { AxisRef } from "../computedAxis.js";

const pp = (code: string, orderKey: number, time = "10:00:00"): PlacedPoint => ({ stockCode: code, date: "2026-07-01", time, orderKey });
const ref = (code: string, time = "10:00:00") => ({ stockCode: code, date: "2026-07-01", time });
const axis = (key: string, name = key): AxisRef => ({ key, name, scope: "point" });

describe("buildAxisIndex", () => {
    it("강=큰 orderKey → rank 1, frac 1. 약=작은 orderKey → rank total, frac 0.", () => {
        const idx = buildAxisIndex([pp("A", 10), pp("B", 20), pp("C", 30)]);
        expect(idx.get(pointKey(ref("C")))).toMatchObject({ rank: 1, total: 3, frac: 1 });
        expect(idx.get(pointKey(ref("B")))).toMatchObject({ rank: 2, total: 3, frac: 0.5 });
        expect(idx.get(pointKey(ref("A")))).toMatchObject({ rank: 3, total: 3, frac: 0 });
    });

    it("타이는 한 칸 — 같은 slot 은 같은 번호, 다음 번호를 건너뛰지 않고 분모도 안 늘어난다.", () => {
        // B·C 동점(같은 slot, 같은 orderKey=20). D 가 가장 강(30). 타점은 4개지만 줄 위의 점은 3개.
        const idx = buildAxisIndex([pp("A", 10), pp("B", 20), pp("C", 20, "10:05:00"), pp("D", 30)]);
        const cell = (code: string, time = "10:00:00") => idx.get(pointKey(ref(code, time)))!;
        expect(cell("D").rank).toBe(1);
        expect(cell("B").rank).toBe(2);
        expect(cell("C", "10:05:00").rank).toBe(2); // 같은 자리 = 같은 번호
        expect(cell("A").rank).toBe(3); // 건너뛰지 않는다(경쟁순위였다면 4)
        expect(cell("A").total).toBe(3); // 분모 = slot 수(타점 4개가 아니라)
    });

    it("빈 라인 → 빈 인덱스.", () => {
        expect(buildAxisIndex([]).size).toBe(0);
    });
});

describe("countPlacedByPoint", () => {
    it("타점이 꽂힌 축 수를 센다(미배치 타점은 키 자체가 없음).", () => {
        const indexByAxis = new Map<string, AxisIndex>([
            ["ax1", buildAxisIndex([pp("A", 10), pp("B", 20)])],
            ["ax2", buildAxisIndex([pp("A", 5)])],
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
            ["ax1", buildAxisIndex([pp("A", 10), pp("B", 20), pp("C", 30)])],
            ["ax2", buildAxisIndex([pp("A", 30), pp("B", 10)])],
            ["ax3", buildAxisIndex([pp("B", 10)])], // A 는 여기 미배치
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

    // "저 축 보여줘"(타점 정보 → 시트) 배선의 계약 — 이름이 아니라 **축 키**가 나가야 시트 열 키
    // (`ax:<키>`)와 맞는다. 판단 축 `p:<이름>` / 계산 축 `c:<키>` 두 형태 모두.
    it("placed 는 축의 클라 키(axisKey)를 싣는다 — 판단(p:)·계산(c:) 형태 그대로", () => {
        const keyed = [axis("p:속도", "속도"), axis("c:gap", "갭 상승률")];
        const indexByAxis = new Map<string, AxisIndex>([
            ["p:속도", buildAxisIndex([pp("A", 10)])],
            ["c:gap", buildAxisIndex([pp("A", 20)])],
        ]);
        const got = placementsOf(ref("A"), keyed, indexByAxis);
        expect(got.placed.map((g) => g.axisKey).sort()).toEqual(["c:gap", "p:속도"]);
        // 미배치 쪽도 AxisRef 그대로라 key 가 산다(타점 정보 패널이 둘 다 같은 손잡이로 지목한다).
        expect(placementsOf(ref("Z"), keyed, indexByAxis).unplaced.map((a) => a.key)).toEqual(["p:속도", "c:gap"]);
    });
});
