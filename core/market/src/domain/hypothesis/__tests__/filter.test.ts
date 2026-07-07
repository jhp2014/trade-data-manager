import { describe, it, expect } from "vitest";
import { pointKey, pointsLinkedToAny, hypothesesForPoint } from "../filter.js";
import type { HypothesisLink } from "../hypothesis.js";

const link = (hypothesisId: string, time: string, stockCode = "005930", date = "2026-06-30"): HypothesisLink => ({
    hypothesisId,
    stockCode,
    date,
    time,
});

describe("hypothesis filter (순수)", () => {
    const links: HypothesisLink[] = [
        link("1", "09:11:00"),
        link("2", "09:11:00"),
        link("1", "10:00:00"),
        link("3", "10:00:00", "000660"),
    ];

    it("pointKey — 삼중키 문자열", () => {
        expect(pointKey({ stockCode: "005930", date: "2026-06-30", time: "09:11:00" })).toBe("005930|2026-06-30|09:11:00");
    });

    it("pointsLinkedToAny — 한 가설에 연결된 타점들", () => {
        expect(pointsLinkedToAny(links, ["1"])).toEqual(
            new Set(["005930|2026-06-30|09:11:00", "005930|2026-06-30|10:00:00"]),
        );
    });

    it("pointsLinkedToAny — 여러 가설 OR 합집합", () => {
        expect(pointsLinkedToAny(links, ["2", "3"])).toEqual(
            new Set(["005930|2026-06-30|09:11:00", "000660|2026-06-30|10:00:00"]),
        );
    });

    it("hypothesesForPoint — 타점→가설 역방향", () => {
        expect(hypothesesForPoint(links, { stockCode: "005930", date: "2026-06-30", time: "09:11:00" })).toEqual(
            new Set(["1", "2"]),
        );
    });
});
