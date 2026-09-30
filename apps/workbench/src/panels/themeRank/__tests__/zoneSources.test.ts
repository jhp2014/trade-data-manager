import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import { exprOfStages, refNode, type SetExpr } from "../../filter/expr.js";
import type { SavedSet } from "../../../store/savedSetsSlice.js";
import { parseScopeZone, themeZoneSourcesOf } from "../zoneSources.js";

const th = (id: string, enabled = true, over: Partial<typeof DEFAULT_THEME_ZONE> = {}, name?: string) =>
    ({ id, enabled, ...(name ? { name } : {}), predicates: [{ kind: "theme" as const, ...DEFAULT_THEME_ZONE, ...over }] });

describe("themeZoneSourcesOf — 보는 집합의 테마 조건 전부(묶음 속·꺼진 줄 포함)", () => {
    it("테마 아닌 줄은 빠지고, 꺼진 줄은 enabled=false 로 남는다 · 줄 이름이 경로에 선다", () => {
        const stages = [th("a", true, { zoneAmountN: 25 }, "주도"), th("b", false),
            { id: "c", enabled: true, predicates: [{ kind: "time" as const, ranges: [{ from: "09:00", to: "09:30" }] }] }];
        const rows = themeZoneSourcesOf(exprOfStages(stages), []);
        expect(rows.map((r) => [r.key, r.enabled])).toEqual([["a:0:0", true], ["b:0:0", false]]);
        expect(rows[0]!.label.startsWith("주도 › 테마 당일 대금≤25")).toBe(true);
        expect(rows[0]!.zone).toEqual({ window: null, zoneAmountN: 25, rate: DEFAULT_THEME_ZONE.rate, from: rows[0]!.label, key: "a:0:0" });
    });

    it("묶음 속 조건도 — 이름 앞에 묶음 경로(이름 없으면 「묶음」)", () => {
        const inner: SetExpr = exprOfStages([th("in", true, { window: 30 })]);
        const outer: SetExpr = { ...exprOfStages([th("top")]), of: [...exprOfStages([th("top")]).of, refNode("g1")], ops: ["and"] };
        const rows = themeZoneSourcesOf(outer, [{ id: "g1", name: "눌림", expr: inner } as SavedSet]);
        expect(rows.map((r) => r.key)).toEqual(["top:0:0", "in:0:0"]);
        expect(rows[1]!.label.startsWith("눌림 › 테마 30분")).toBe(true);
        expect(themeZoneSourcesOf(outer, [{ id: "g1", expr: inner } as SavedSet])[1]!.label.startsWith("묶음 › ")).toBe(true);
    });
});

describe("parseScopeZone", () => {
    it("객체 아니면 null · 세 값은 테마 파서로 · 출처 이름·주소 보존", () => {
        expect(parseScopeZone(null)).toBeNull();
        expect(parseScopeZone("x")).toBeNull();
        const z = parseScopeZone({ window: 60, zoneAmountN: 20, rate: { mode: "value", minPct: 5 }, from: "줄 1", key: "a:0:0" })!;
        expect(z).toEqual({ window: 60, zoneAmountN: 20, rate: { mode: "value", minPct: 5 }, from: "줄 1", key: "a:0:0" });
    });
});
