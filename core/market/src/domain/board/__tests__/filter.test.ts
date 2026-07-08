import { describe, it, expect } from "vitest";
import { evalBoardFilter, isBoardFilterActive, defaultParams, type BoardFilterExpr, type BoardMetrics } from "../filter.js";

const metrics = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 20, amount: 300e8, buckets: [1, 1, 3, 0, 0, 0, 0], trailingHighs: [20, 5, 3], ...over });
const grp = (kind: string, params: Record<string, number>, mode: "dim" | "hide" = "dim") => ({ predicates: [{ kind, params }], mode });

describe("board filter (순수)", () => {
    it("defaultParams — 레지스트리 기본값", () => {
        expect(defaultParams("smallAmount")).toEqual({ ltEok: 100 });
        expect(defaultParams("minAmtFew")).toEqual({ eok: 50, maxCount: 0 });
    });

    it("weakHigh — 고가 등락률 < 기준이면 제외(dim)", () => {
        const expr: BoardFilterExpr = { groups: [grp("weakHigh", { ltPct: 10 })] };
        expect(evalBoardFilter(expr, metrics({ highPct: 8 })).effect).toBe("dim");
        expect(evalBoardFilter(expr, metrics({ highPct: 12 })).effect).toBe("show");
    });

    it("smallAmount — 총거래대금 < 100억 제외", () => {
        const expr: BoardFilterExpr = { groups: [grp("smallAmount", { ltEok: 100 })] };
        expect(evalBoardFilter(expr, metrics({ amount: 50e8 })).effect).toBe("dim");
        expect(evalBoardFilter(expr, metrics({ amount: 200e8 })).effect).toBe("show");
    });

    it("minAmtFew — ≥50억 분봉 횟수 ≤ 0 이면 제외", () => {
        const expr: BoardFilterExpr = { groups: [grp("minAmtFew", { eok: 50, maxCount: 0 })] };
        // buckets 인덱스 2(50억)~ 합 = 3 → 0회 아님 → show
        expect(evalBoardFilter(expr, metrics({ buckets: [1, 1, 3, 0, 0, 0, 0] })).effect).toBe("show");
        // ≥50억 구간 전부 0 → 0회 → 제외
        expect(evalBoardFilter(expr, metrics({ buckets: [5, 5, 0, 0, 0, 0, 0] })).effect).toBe("dim");
    });

    it("newHighFar — 20일 최고가 밖이면 제외", () => {
        const expr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2 })] };
        // 당일 20 = 최고 20 → 근접 → show
        expect(evalBoardFilter(expr, metrics({ trailingHighs: [20, 5, 3] })).effect).toBe("show");
        // 당일 5, 최고 30 → 갭 25 > 2 → 밖 → 제외
        expect(evalBoardFilter(expr, metrics({ trailingHighs: [5, 30, 3] })).effect).toBe("dim");
    });

    it("그룹 AND, 그룹끼리 OR + 그룹별 mode(hide 우선)", () => {
        const expr: BoardFilterExpr = {
            groups: [
                { predicates: [{ kind: "smallAmount", params: { ltEok: 100 } }, { kind: "weakHigh", params: { ltPct: 10 } }], mode: "hide" }, // AND
                grp("weakHigh", { ltPct: 5 }, "dim"),
            ],
        };
        // 소액 AND 약세 둘 다 참(hide 그룹) → hide
        expect(evalBoardFilter(expr, metrics({ amount: 50e8, highPct: 8 })).effect).toBe("hide");
        // 소액만 참(AND 불충족) · 약세<5 아님 → show
        expect(evalBoardFilter(expr, metrics({ amount: 50e8, highPct: 20 })).effect).toBe("show");
        // 약세<5(dim 그룹만) → dim
        expect(evalBoardFilter(expr, metrics({ amount: 500e8, highPct: 3 })).effect).toBe("dim");
    });

    it("사유(reasons) — 매칭 술어 라벨", () => {
        const expr: BoardFilterExpr = { groups: [grp("weakHigh", { ltPct: 10 })] };
        expect(evalBoardFilter(expr, metrics({ highPct: 8 })).reasons).toEqual(["고가 <10%"]);
    });

    it("isBoardFilterActive", () => {
        expect(isBoardFilterActive({ groups: [] })).toBe(false);
        expect(isBoardFilterActive({ groups: [{ predicates: [], mode: "dim" }] })).toBe(false);
        expect(isBoardFilterActive({ groups: [grp("weakHigh", { ltPct: 10 })] })).toBe(true);
    });
});
