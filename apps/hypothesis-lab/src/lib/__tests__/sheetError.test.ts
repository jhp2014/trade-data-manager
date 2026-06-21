import { describe, expect, it } from "vitest";
import { classifySheetError } from "@/lib/sheetError";

describe("classifySheetError", () => {
    it("'Unable to parse range' 는 tab-missing 으로 분류한다", () => {
        const err = new Error("Unable to parse range: 'D1'!A:ZZZ");
        expect(classifySheetError(err, "D1")).toEqual({ kind: "tab-missing", tab: "D1" });
    });

    it("그 외 에러는 read-failed 로 분류한다", () => {
        expect(classifySheetError(new Error("invalid_grant"), "review")).toEqual({
            kind: "read-failed",
            tab: "review",
        });
    });

    it("Error 가 아닌 값도 read-failed 로 처리한다", () => {
        expect(classifySheetError("boom", "review").kind).toBe("read-failed");
    });
});
