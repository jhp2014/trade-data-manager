import { describe, it, expect } from "vitest";
import type { ThemeZoneVerdict as ThemeVerdict } from "@trade-data-manager/market/domain";
import { pointInfoRows, slotOf } from "../rows.js";

// 2026-09-26 종단 폐기 — 축·결과 줄이 은퇴하고 테마 줄만 남았다(옛 축·결과 규칙 테스트는 그때 삭제).
const v = (theme: string, over: Partial<ThemeVerdict> = {}): ThemeVerdict =>
    ({ theme, pass: true, zoneCount: 7, baseRank: 3, zoneRank: 2, ...over });

describe("pointInfoRows — 테마 줄", () => {
    it("키 이름공간은 th: — 진단이 null(재료 미도착)이면 줄 자체가 없다", () => {
        expect(pointInfoRows({ verdicts: null })).toEqual([]);
        const rows = pointInfoRows({ verdicts: [v("반도체"), v("2차전지", { zoneRank: null })] });
        expect(rows.map((r) => r.key)).toEqual(["th:반도체", "th:2차전지"]);
    });

    it("존 밖은 결손이 아니라 사실 — 본문에 「존 밖」으로 선다(서랍 = 기계가 못 준 것)", () => {
        const rows = pointInfoRows({ verdicts: [v("A", { zoneRank: null })] });
        expect(rows[0]!.value?.text).toBe("존 밖");
        expect(slotOf(rows[0]!, new Set())).toBe("body");
    });

    it("존 순위 단독이 값이고 나머지(인원·전체 순위·통과)는 툴팁이 진다", () => {
        const rows = pointInfoRows({ verdicts: [v("A", { zoneRank: 4, zoneCount: 9, baseRank: 11, pass: false })] });
        expect(rows[0]!.value?.text).toBe("4위");
        expect(rows[0]!.title).toContain("존 인원 9");
        expect(rows[0]!.title).toContain("전체 순위 11위");
        expect(rows[0]!.title).toContain("불통과");
    });
});

describe("slotOf — 숨김이 결손보다 세다(내가 치운 것이 먼저)", () => {
    it("숨김 > 결손 > 본문", () => {
        const row = pointInfoRows({ verdicts: [v("A")] })[0]!;
        expect(slotOf(row, new Set(["th:A"]))).toBe("hidden");
        expect(slotOf({ ...row, value: null }, new Set())).toBe("missing");
        expect(slotOf(row, new Set())).toBe("body");
    });
});
