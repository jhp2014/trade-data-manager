import { describe, it, expect } from "vitest";
import { toCellConditions } from "../useCellSet.js";
import type { FilterStage } from "../stage.js";

// 좁히기(종단 어휘 → 셀 어휘)가 틀리면 화면이 **조용히 다른 모수**를 센다 — 그래서 순수부를 잠근다.

const stage = (id: string, predicates: FilterStage["predicates"], extra: Partial<FilterStage> = {}): FilterStage =>
    ({ id, enabled: true, predicates, ...extra });

const cell = stage("c1", [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] }]);
const axis = stage("a1", [{ kind: "axisValue", axisId: "x", ranges: [{ from: { kind: "value", value: 1 } }] }]);

describe("toCellConditions", () => {
    it("셀 술어 칸은 그대로 넘어간다(이름·전이 포함)", () => {
        const withName = stage("c2", cell.predicates, { name: "돌파", transition: "firstOfDay" });
        const { conditions } = toCellConditions([withName]);
        // ⚠ **칸 전이가 반드시 실려야 한다** — 빠지면 "하루 처음"이 조용히 사라져 매 분 재발화한다.
        expect(conditions).toEqual([{ id: "c2", name: "돌파", enabled: true, predicates: withName.predicates, transition: "firstOfDay" }]);
    });

    it("결손 칸은 **평가에서 빠지고 그 사실이 함께 나온다** — 조용히 0건이 되지 않는다", () => {
        const { conditions, stages } = toCellConditions([cell, axis]);
        expect(conditions.map((c) => c.id)).toEqual(["c1"]);
        expect(stages.find((s) => s.stageId === "a1")).toMatchObject({ counted: false });
        expect(stages.find((s) => s.stageId === "a1")!.reasons.length).toBeGreaterThan(0);
        expect(stages.find((s) => s.stageId === "c1")).toMatchObject({ counted: true, reasons: [] });
    });

    it("꺼진 칸·빈 칸은 애초에 안 들어온다(activeStages 규칙 그대로)", () => {
        const off = stage("off", cell.predicates, { enabled: false });
        const empty = stage("empty", [{ kind: "cellValue", field: "ratePct", ranges: [] }]);
        const { conditions, stages } = toCellConditions([off, empty]);
        expect(conditions).toEqual([]);
        expect(stages).toEqual([]);
    });
});
