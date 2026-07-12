import { describe, it, expect } from "vitest";
import { SheetMembership } from "../membership.js";
import type { ThemeMember } from "@trade-data-manager/market";

describe("SheetMembership", () => {
    it("code→themes 맵 구성(1:N)", async () => {
        const m = new SheetMembership({
            load: async (): Promise<ThemeMember[]> => [
                { theme: "AI", code: "005930" },
                { theme: "반도체", code: "005930" },
                { theme: "AI", code: "000660" },
            ],
        });
        await m.reload();
        expect(m.themesOf("005930")).toEqual(["AI", "반도체"]);
        expect(m.themesOf("000660")).toEqual(["AI"]);
    });

    it("미분류(맵에 없는) 코드는 빈 배열", async () => {
        const m = new SheetMembership({ load: async (): Promise<ThemeMember[]> => [{ theme: "AI", code: "005930" }] });
        await m.reload();
        expect(m.themesOf("999999")).toEqual([]);
    });

    it("reload 실패는 throw하고 직전 성공 맵을 유지(원자 스왑)", async () => {
        let fail = false;
        const m = new SheetMembership({
            load: async (): Promise<ThemeMember[]> => {
                if (fail) throw new Error("sheet down");
                return [{ theme: "AI", code: "005930" }];
            },
        });
        await m.reload();
        expect(m.themesOf("005930")).toEqual(["AI"]);
        fail = true;
        await expect(m.reload()).rejects.toThrow("sheet down");
        expect(m.themesOf("005930")).toEqual(["AI"]); // 실패해도 직전 맵 유지 → 호출측(엔진)이 catch
    });
});
