import { describe, it, expect } from "vitest";
import { evalBoardFilter, isBoardFilterActive, defaultParams, type BoardFilterExpr, type BoardMetrics } from "../filter.js";

const metrics = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 20, amount: 300e8, buckets: [1, 1, 3, 0, 0, 0, 0], trailingHighs: { krx: [20, 5, 3], un: [20, 5, 3] }, ...over });
const grp = (kind: string, params: Record<string, number>, mode: "dim" | "hide" = "dim") => ({ predicates: [{ kind, params }], mode });

describe("board filter (순수)", () => {
    it("defaultParams — 레지스트리 기본값", () => {
        expect(defaultParams("smallAmount")).toEqual({ ltEok: 100 });
        expect(defaultParams("minAmtFew")).toEqual({ eok: 50, maxCount: 0 });
        expect(defaultParams("newHighFar")).toEqual({ market: 1, window: 20, tol: 2 }); // market 기본 UN
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

    it("newHighFar — 20일 최고가 밖이면 제외 (market 파라미터로 시장 선택, 미지정=UN)", () => {
        const expr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2 })] };
        // 당일 20 = 최고 20 → 근접 → show
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: [5, 30, 3], un: [20, 5, 3] } })).effect).toBe("show");
        // 당일 5, 최고 30 → 갭 25 > 2 → 밖 → 제외 (UN 기준 — market 미지정 폴백)
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: [20, 5, 3], un: [5, 30, 3] } })).effect).toBe("dim");
        // market=0(KRX) 명시 → KRX 배열로 판정
        const krxExpr: BoardFilterExpr = { groups: [grp("newHighFar", { market: 0, window: 20, tol: 2 })] };
        expect(evalBoardFilter(krxExpr, metrics({ trailingHighs: { krx: [5, 30, 3], un: [20, 5, 3] } })).effect).toBe("dim");
        expect(evalBoardFilter(krxExpr, metrics({ trailingHighs: { krx: [20, 5, 3], un: [5, 30, 3] } })).effect).toBe("show");
    });

    it("newHighFar KRX AND UN — 둘 다 매물대 내부여야 흐리게(한쪽 돌파 시 해제)", () => {
        const expr: BoardFilterExpr = {
            groups: [
                {
                    predicates: [
                        { kind: "newHighFar", params: { market: 0, window: 20, tol: 2 } },
                        { kind: "newHighFar", params: { market: 1, window: 20, tol: 2 } },
                    ],
                    mode: "dim",
                },
            ],
        };
        const inside = [5, 30, 3]; // 매물대 내부(당일 5 vs 최고 30)
        const breakout = [20, 5, 3]; // 돌파(당일=창최고)
        // 둘 다 내부 → 흐리게
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: inside, un: inside } })).effect).toBe("dim");
        // KRX 돌파 → AND 불충족 → 해제
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: breakout, un: inside } })).effect).toBe("show");
        // UN 돌파 → 해제
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: inside, un: breakout } })).effect).toBe("show");
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
        expect(evalBoardFilter(expr, metrics({ highPct: 8 })).reasons).toEqual(["고가 등락률"]);
    });

    it("isBoardFilterActive", () => {
        expect(isBoardFilterActive({ groups: [] })).toBe(false);
        expect(isBoardFilterActive({ groups: [{ predicates: [], mode: "dim" }] })).toBe(false);
        expect(isBoardFilterActive({ groups: [grp("weakHigh", { ltPct: 10 })] })).toBe(true);
    });
});
