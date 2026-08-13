import { describe, it, expect } from "vitest";
import { applyRailPredicate, predicateFor, railKeyOf, sameRailKey, stagesFor, type RailKey } from "../stageBinding.js";
import type { FilterPredicate, FilterStage } from "../stage.js";

const stage = (id: string, predicates: FilterPredicate[]): FilterStage => ({ id, enabled: true, predicates });
const band = (axisId: string, lo: string): FilterPredicate => ({ kind: "axisBand", axisId, band: { lo } });
const value = (axisId: string, v: number): FilterPredicate => ({ kind: "axisValue", axisId, ranges: [{ from: { kind: "value", value: v } }] });
const dates: FilterPredicate = { kind: "date", ranges: [{ from: "2026-07-01", to: "2026-07-31" }] };
const AX: RailKey = { kind: "axis", axisId: "a1" };

describe("railKeyOf — 그룹만 레일이 없다", () => {
    it("축은 id 로, 날짜·시간은 종류로", () => {
        expect(railKeyOf(band("a1", "s1"))).toEqual({ kind: "axis", axisId: "a1" });
        expect(railKeyOf(value("a1", 3))).toEqual({ kind: "axis", axisId: "a1" });
        expect(railKeyOf(dates)).toEqual({ kind: "date" });
    });

    it("그룹은 순서가 없어 레일이 아니다", () => {
        expect(railKeyOf({ kind: "group", expr: { groups: [] } })).toBeNull();
    });
});

describe("sameRailKey", () => {
    it("축은 id 까지 같아야 같다", () => {
        expect(sameRailKey(AX, { kind: "axis", axisId: "a1" })).toBe(true);
        expect(sameRailKey(AX, { kind: "axis", axisId: "a2" })).toBe(false);
        expect(sameRailKey(AX, { kind: "date" })).toBe(false);
    });

    it("밴드와 값 구간은 같은 축이면 같은 레일이다(한 축에 손잡이가 둘일 뿐)", () => {
        expect(sameRailKey(railKeyOf(band("a1", "s1"))!, railKeyOf(value("a1", 3))!)).toBe(true);
    });
});

describe("stagesFor · predicateFor", () => {
    const stages = [stage("s1", [band("a1", "x")]), stage("s2", [dates]), stage("s3", [band("a1", "y")])];

    it("그 레일에 매인 필터를 순서대로", () => {
        expect(stagesFor(stages, AX).map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("레일이 그리는 건 첫 필터의 조건", () => {
        expect(predicateFor(stages, AX)).toEqual(band("a1", "x"));
        expect(predicateFor(stages, { kind: "time" })).toBeUndefined();
    });
});

describe("applyRailPredicate — 레일 하나 = 필터 하나", () => {
    it("처음 그으면 새 필터가 생긴다", () => {
        const next = applyRailPredicate([], AX, band("a1", "x"));
        expect(next).toHaveLength(1);
        expect(next[0]!.predicates).toEqual([band("a1", "x")]);
        expect(next[0]!.enabled).toBe(true);
    });

    it("이미 있으면 그 필터를 갈아끼운다(새로 만들지 않는다)", () => {
        const before = [stage("s1", [band("a1", "x")]), stage("s2", [dates])];
        const next = applyRailPredicate(before, AX, band("a1", "z"));
        expect(next.map((s) => s.id)).toEqual(["s1", "s2"]);
        expect(next[0]!.predicates).toEqual([band("a1", "z")]);
    });

    it("같은 축의 밴드를 값 구간으로 바꿔도 같은 필터 자리다", () => {
        const next = applyRailPredicate([stage("s1", [band("a1", "x")])], AX, value("a1", 5));
        expect(next).toHaveLength(1);
        expect(next[0]!.predicates).toEqual([value("a1", 5)]);
    });

    it("조건이 없어지면 그 필터를 지운다 — 빈 줄을 남기지 않는다", () => {
        const before = [stage("s1", [band("a1", "x")]), stage("s2", [dates])];
        expect(applyRailPredicate(before, AX, null).map((s) => s.id)).toEqual(["s2"]);
    });

    it("지울 게 없으면 아무 일도 안 한다", () => {
        expect(applyRailPredicate([stage("s2", [dates])], AX, null).map((s) => s.id)).toEqual(["s2"]);
    });

    it("옛 저장본처럼 둘 이상 매여 있으면 첫 것만 건드린다", () => {
        const before = [stage("s1", [band("a1", "x")]), stage("s3", [band("a1", "y")])];
        const next = applyRailPredicate(before, AX, band("a1", "z"));
        expect(next[0]!.predicates).toEqual([band("a1", "z")]);
        expect(next[1]!.predicates).toEqual([band("a1", "y")]);
    });

    it("다른 레일의 필터는 순서까지 그대로", () => {
        const before = [stage("s2", [dates]), stage("s1", [band("a1", "x")])];
        expect(applyRailPredicate(before, { kind: "date" }, null).map((s) => s.id)).toEqual(["s1"]);
    });
});
