import { describe, it, expect } from "vitest";
import { toCellExpr } from "../useCellSet.js";
import { exprOfStages, type SetExpr } from "../expr.js";
import type { FilterStage } from "../stage.js";

// 좁히기(종단 어휘 → 셀 어휘)가 틀리면 화면이 **조용히 다른 모수**를 센다 — 그래서 순수부를 잠근다.

const stage = (id: string, predicates: FilterStage["predicates"], extra: Partial<FilterStage> = {}): FilterStage =>
    ({ id, enabled: true, predicates, ...extra });

const cell = stage("c1", [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] }]);
const axis = stage("a1", [{ kind: "axisValue", axisId: "x", ranges: [{ from: { kind: "value", value: 1 } }] }]);
const leafIds = (e: SetExpr): string[] => {
    const { expr } = toCellExpr(e);
    const out: string[] = [];
    const walk = (n: NonNullable<typeof expr>): void => {
        if (n.kind === "pred") { out.push(n.id); return; }
        for (const c of n.of) walk(c);
    };
    if (expr) walk(expr);
    return out;
};

describe("toCellExpr — 잎 변환", () => {
    it("셀 술어 잎은 그대로 넘어간다 · **전이가 술어에 실린다**(술어 하나짜리 칸)", () => {
        const withName = stage("c2", cell.predicates, { name: "돌파", transition: "firstOfDay" });
        const { expr } = toCellExpr(exprOfStages([withName]));
        // ⚠ 전이가 빠지면 "하루 처음"이 조용히 사라져 매 분 재발화한다(후보 수가 소리 없이 는다).
        expect(expr).toMatchObject({
            kind: "and",
            of: [{ kind: "pred", id: "c2", pred: { ...cell.predicates[0], transition: "firstOfDay" } }],
        });
    });

    it("술어가 여럿인 칸은 **AND 묶음**이 된다 — 첫 술어만 싣지 않는다", () => {
        const two = stage("c3", [
            cell.predicates[0]!,
            { kind: "time", ranges: [{ from: "09:00", to: "10:00" }] },
        ], { transition: "firstTrue" });
        const { expr } = toCellExpr(exprOfStages([two]));
        expect(expr).toMatchObject({
            kind: "and",
            of: [{ kind: "and", id: "c3", transition: "firstTrue", of: [{ kind: "pred" }, { kind: "pred" }] }],
        });
    });
});

describe("toCellExpr — 결손", () => {
    it("결손 잎은 빠지고 그 사실이 함께 나온다 — 조용히 0건이 되지 않는다", () => {
        const e: SetExpr = {
            kind: "or", id: "root",
            of: [{ kind: "cond", stage: cell }, { kind: "cond", stage: axis }],
        };
        const { stages } = toCellExpr(e);
        expect(leafIds(e)).toEqual(["c1"]);
        expect(stages.find((s) => s.stageId === "a1")).toMatchObject({ counted: false });
        expect(stages.find((s) => s.stageId === "a1")!.reasons.length).toBeGreaterThan(0);
        expect(stages.find((s) => s.stageId === "c1")).toMatchObject({ counted: true, reasons: [] });
    });

    // ⚠ AND 에서 결손 잎만 빼면 그 묶음이 **느슨해진다**(사용자가 건 적 없는 더 넓은 집합).
    //   그래서 묶음째 뺀다 — 옛 평평한 시절의 "결손 술어가 든 칸을 통째로 뺀다"와 같은 규칙.
    it("AND 는 결손 형제 하나에 **묶음째** 빠진다 — 멀쩡한 잎에도 이유가 달린다", () => {
        const e = exprOfStages([cell, axis]); // 루트 AND
        expect(leafIds(e)).toEqual([]);
        const { stages } = toCellExpr(e);
        expect(stages.find((s) => s.stageId === "c1")).toMatchObject({ counted: false });
        expect(stages.find((s) => s.stageId === "c1")!.reasons[0]).toMatch(/묶음/);
    });

    it("OR 은 그 가지만 빠진다 — 나머지 가지가 그대로 선다", () => {
        const e: SetExpr = {
            kind: "or", id: "root",
            of: [
                { kind: "and", id: "n1", of: [{ kind: "cond", stage: cell }, { kind: "cond", stage: axis }] },
                { kind: "cond", stage: stage("c9", cell.predicates) },
            ],
        };
        expect(leafIds(e)).toEqual(["c9"]);
    });
});

describe("toCellExpr — 꺼짐·빈 술어는 부재다", () => {
    it("꺼진 잎·빈 술어 잎은 애초에 안 들어온다(status 에도 안 선다)", () => {
        const off = stage("off", cell.predicates, { enabled: false });
        const empty = stage("empty", [{ kind: "cellValue", field: "ratePct", ranges: [] }]);
        const { expr, stages } = toCellExpr(exprOfStages([off, empty]));
        expect(expr).toBeNull();
        expect(stages).toEqual([]);
    });
});

describe("toCellExpr — 부정", () => {
    it("잎·묶음의 부정이 그대로 실린다", () => {
        const e: SetExpr = {
            kind: "and", id: "root",
            of: [{ kind: "cond", stage: cell, neg: true }],
        };
        expect(toCellExpr(e).expr).toMatchObject({ of: [{ kind: "pred", id: "c1", neg: true }] });
    });
});
