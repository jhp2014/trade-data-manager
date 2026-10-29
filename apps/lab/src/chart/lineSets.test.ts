import { describe, expect, it } from "vitest";
import { chipAction, fromLabDaily, mergeDaily, mergeMinute, toLabDaily, toLabMinute } from "./lineSets.js";
import type { DailyLine } from "../lib/stateToken.js";
import type { LabChartLine } from "../market/types.js";

const H: DailyLine = { date: "2026-06-26", field: "H", venue: "un" };
const L: DailyLine = { date: "2026-07-06", field: "L", venue: "un" };
const savedOf = (l: DailyLine): LabChartLine => toLabDaily(l, "2026-07-28");

describe("mergeDaily — 같은 선은 하나, 종류로 가른다", () => {
    it("임시만 · 둘 다 · 저장만", () => {
        const k = mergeDaily([H, L], [savedOf(L), savedOf({ ...H, field: "C" })]).map((x) => [x.item.field, x.kind]);
        expect(k).toEqual([["H", "temp"], ["L", "both"], ["C", "saved"]]);
    });
    it("분봉 저장 선은 일봉에 섞이지 않는다", () => {
        const minute = toLabMinute({ date: "2026-07-28", time: "09:31:00", field: "H" }, "2026-07-28");
        expect(mergeDaily([], [minute])).toEqual([]);
        expect(mergeMinute([], [minute]).map((x) => x.kind)).toEqual(["saved"]);
        expect(mergeMinute([{ date: "2026-07-28", time: "09:31:00", field: "H" }], [minute]).map((x) => x.kind)).toEqual(["both"]);
    });
});

describe("가장자리", () => {
    it("시장만 다른 같은 값은 두 선 · 왕복은 그대로", () => {
        expect(mergeDaily([H, { ...H, venue: "krx" }], []).map((x) => x.kind)).toEqual(["temp", "temp"]);
        expect(fromLabDaily(toLabDaily(L, "2026-07-28"))).toEqual(L);
    });
    it("칩 손짓 표 — 클릭: 임시만 저장·저장만 가져옴·둘 다 없음 / 우클릭: 임시만 임시 지움·나머지 저장에서 지움", () => {
        expect([chipAction("temp", "click"), chipAction("saved", "click"), chipAction("both", "click")]).toEqual(["save", "import", null]);
        expect([chipAction("temp", "context"), chipAction("saved", "context"), chipAction("both", "context")]).toEqual(["dropTemp", "dropSaved", "dropSaved"]);
    });
});
