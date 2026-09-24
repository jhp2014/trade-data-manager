// 모드 문지기 — 지금 모드의 반대편에만 사는 조건은 편집 집합에 못 들어온다(2026-09-24).
// 하루 고정 뒤에도 종단 판(결과·급타점)이 쓰기 손을 갖고 있어, 막지 않으면 빈 하루 집합이 재조정으로
// 종단으로 뒤집혀 하루 목록에서 사라진다. 막는 건 **새로 쓰는 술어**뿐 — 이미 있는 조건의 편집·끄기·삭제는 된다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exprOfStages } from "../../panels/filter/expr.js";
import { seedEditing } from "../../test/renderPanel.js";
import { selectEditingStages, useWorkbench } from "../workbench.js";

const RATE = { id: "r1", enabled: true, predicates: [{ kind: "cellValue" as const, field: "ratePct" as const, ranges: [{ from: { kind: "value" as const, value: 5 } }] }] };
const OUTCOME = { kind: "outcome" as const, metric: "extHigh" as const, t: 2, ranges: [{ from: { kind: "value" as const, value: 5 } }] };
const stages = () => selectEditingStages(useWorkbench.getState());

beforeEach(() => { seedEditing(exprOfStages([RATE]), [], "daily"); });
afterEach(() => { useWorkbench.setState({ savedSets: [], filterMode: "longitudinal" }); });

describe("모드 문지기(하루)", () => {
    it("종단 전용 조건(결과 컷)은 추가되지 않는다 — 집합이 종단으로 뒤집히지 않는다", () => {
        useWorkbench.getState().addFilterStage([OUTCOME]);
        expect(stages().map((s) => s.id)).toEqual(["r1"]);
        expect(useWorkbench.getState().savedSets.find((x) => x.id === "edit")?.universe).toBe("daily");
    });

    it("있는 조건을 종단 전용으로 갈아 끼우는 쓰기도 막는다", () => {
        useWorkbench.getState().setFilterStagePredicates("r1", [OUTCOME]);
        expect(stages()[0]!.predicates[0]!.kind).toBe("cellValue");
    });

    it("하루·중립 조건은 그대로 된다 — 추가·갈아 끼우기·끄기·삭제", () => {
        const st = useWorkbench.getState();
        st.addFilterStage([{ kind: "breakout", zigzagPct: 2, bandPct: 0.5, label: "all", chain: { firstK: 1 } }]);
        st.addFilterStage([{ kind: "time", ranges: [{ from: "09:00", to: "10:00" }] }]);
        expect(stages()).toHaveLength(3);
        useWorkbench.getState().toggleFilterStage("r1");
        expect(stages()[0]!.enabled).toBe(false);
        useWorkbench.getState().removeFilterStage("r1");
        expect(stages()).toHaveLength(2);
    });
});
