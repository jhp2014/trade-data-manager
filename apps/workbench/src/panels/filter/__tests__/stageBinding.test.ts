import { describe, it, expect } from "vitest";
import { applyRailToExpr, predicateFor, railKeyOf, sameRailKey, stagesFor, type RailKey } from "../stageBinding.js";
import { exprOfStages, leavesOf } from "../expr.js";
import type { FilterPredicate, FilterStage } from "../stage.js";

// 2026-09-26 종단 폐기 — 축·날짜·결과·급타점 레일은 kind 와 함께 은퇴했다. 남은 레일은 시각 하나다.

const stage = (id: string, predicates: FilterPredicate[]): FilterStage => ({ id, enabled: true, predicates });
const time = (from: string, to: string): FilterPredicate => ({ kind: "time", ranges: [{ from, to }] });
const TIME: RailKey = { kind: "time" };

const applyRailPredicate = (stages: FilterStage[], key: RailKey, predicate: FilterPredicate | null): FilterStage[] =>
    leavesOf(applyRailToExpr(exprOfStages(stages), key, predicate));

describe("railKeyOf — 시각만 레일이다", () => {
    it("시각은 종류로, 팝오버 종류(테마·돌파)와 셀 술어는 null", () => {
        expect(railKeyOf(time("09:00", "10:30"))).toEqual({ kind: "time" });
        expect(railKeyOf({ kind: "candle", axes: { openClose: { on: true, from: 0.01 } } })).toBeNull();
        expect(railKeyOf({ kind: "cellValue", field: "cumAmountEok", ranges: [] })).toBeNull();
    });
});

describe("sameRailKey", () => {
    it("종류가 같으면 같다", () => {
        expect(sameRailKey(TIME, { kind: "time" })).toBe(true);
    });
});

describe("stagesFor · predicateFor", () => {
    const stages = [stage("s1", [time("09:00", "10:30")]), stage("s2", [{ kind: "candle", axes: { openClose: { on: true, from: 0.01 } } }]), stage("s3", [time("13:00", "14:00")])];

    it("그 레일에 매인 필터를 순서대로", () => {
        expect(stagesFor(stages, TIME).map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("레일이 그리는 건 첫 필터의 조건", () => {
        expect(predicateFor(stages, TIME)).toEqual(time("09:00", "10:30"));
        expect(predicateFor([stage("s2", [{ kind: "candle", axes: { openClose: { on: true, from: 0.01 } } }])], TIME)).toBeUndefined();
    });
});

describe("레일 쓰기 — 주소(stageId)가 고칠 줄을 정한다", () => {
    it("처음 그으면 새 필터가 생기고, 주소로 그 줄만 고친다(시각A ∨ 시각B 보존)", () => {
        const first = applyRailPredicate([], TIME, time("09:00", "10:30"));
        expect(first).toHaveLength(1);
        const two = [stage("a", [time("09:00", "10:30")]), stage("b", [time("13:00", "14:00")])];
        const next = leavesOf(applyRailToExpr(exprOfStages(two), TIME, time("13:30", "14:30"), "b"));
        expect(next.map((s) => s.predicates[0])).toEqual([time("09:00", "10:30"), time("13:30", "14:30")]);
    });

    it("null 이면 그 줄이 사라진다(빈 필터를 안 남긴다)", () => {
        const two = [stage("a", [time("09:00", "10:30")])];
        expect(leavesOf(applyRailToExpr(exprOfStages(two), TIME, null, "a"))).toHaveLength(0);
    });
});
