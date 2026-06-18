import { describe, expect, it, vi } from "vitest";
import { SheetWorkingSetSource } from "@/repositories/SheetWorkingSetSource";

describe("SheetWorkingSetSource", () => {
    it("주입된 reader 의 매트릭스를 caseId 목록으로 변환한다", async () => {
        const read = vi.fn().mockResolvedValue([
            ["stockCode", "stockName", "tradeDate", "tradeTime"],
            ["055550", "신한지주", "2026-06-05", "09:11"],
        ]);
        const source = new SheetWorkingSetSource(
            { spreadsheetId: "sid", tab: "review" },
            read,
        );

        const caseIds = await source.listCaseIds();

        expect(read).toHaveBeenCalledWith("sid", "review");
        expect(caseIds).toEqual(["055550-2026-06-05-0911"]);
    });
});
