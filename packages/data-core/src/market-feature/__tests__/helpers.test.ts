import { describe, expect, it } from "vitest";
import { buildColumnsFromCalculators, mergeCalculatorOutputs } from "../helpers";

describe("market feature helpers", () => {
    it("merges calculator outputs", () => {
        expect(mergeCalculatorOutputs([
            { closeRateNxt: "1.20" },
            { tradingAmount: "5000000000" },
        ])).toEqual({
            closeRateNxt: "1.20",
            tradingAmount: "5000000000",
        });
    });

    it("throws when calculator output keys collide", () => {
        expect(() => mergeCalculatorOutputs([
            { closeRateNxt: "1.20" },
            { closeRateNxt: "1.30" },
        ])).toThrow('[mergeCalculatorOutputs] Output key collision: "closeRateNxt"');
    });

    it("merges calculator column definitions", () => {
        const columns = buildColumnsFromCalculators([
            { columns: () => ({ a: "col_a" }) },
            { columns: () => ({ b: "col_b" }) },
        ]);

        expect(columns).toEqual({ a: "col_a", b: "col_b" });
    });

    it("throws when calculator column names collide", () => {
        expect(() => buildColumnsFromCalculators([
            { columns: () => ({ a: "col_a" }) },
            { columns: () => ({ a: "col_a2" }) },
        ])).toThrow('[buildColumnsFromCalculators] Column name collision: "a"');
    });
});
