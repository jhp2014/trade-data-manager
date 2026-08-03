import { describe, it, expect } from "vitest";
import { computedAxisView, formatAxisValue } from "../computedAxis.js";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";

const feed = (over: Partial<ComputedAxisFeed> = {}): ComputedAxisFeed => ({
    key: "fake",
    name: "가짜 축",
    strongerWhen: "higher",
    values: [{ stockCode: "005930", date: "2026-07-02", time: "09:30:00", value: 3 }],
    ...over,
});

describe("formatAxisValue", () => {
    it("규격이 없으면 등락률 모양 — 기존 축 둘의 표시가 그대로 유지된다", () => {
        expect(formatAxisValue(12.34)).toBe("+12.3%");
        expect(formatAxisValue(-4)).toBe("-4.0%");
        expect(formatAxisValue(0)).toBe("0.0%");
    });

    it("규격을 주면 단위·자릿수·부호가 축을 따른다", () => {
        const days = { suffix: "일", decimals: 0, signed: false };
        expect(formatAxisValue(3, days)).toBe("3일"); // 거래일 수에 "+3.0%" 가 붙으면 거짓말이 된다
        expect(formatAxisValue(0, days)).toBe("0일");
    });
});

describe("computedAxisView", () => {
    it("축의 표시 규격을 fmt 로 싸서 넘긴다 — 화면이 축별 분기를 갖지 않게", () => {
        const v = computedAxisView(feed({ display: { suffix: "일", decimals: 0, signed: false } }));
        expect(v.fmt(3)).toBe("3일");
    });

    it("strongerWhen=lower 면 orderKey 부호를 뒤집는다(큰 orderKey = 강 관례)", () => {
        expect(computedAxisView(feed({ strongerWhen: "lower" })).line[0].orderKey).toBe(-3);
        expect(computedAxisView(feed()).line[0].orderKey).toBe(3);
    });
});
