import { describe, it, expect } from "vitest";
import { computedAxisView, formatAxisValue } from "../computedAxis.js";
import type { ComputedAxisFeed, ComputedAxisPoint } from "@trade-data-manager/wire";

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

describe("computedAxisView 포화(우측 절단) 자리잡기", () => {
    const pt = (time: string, value: number, saturated?: true): ComputedAxisPoint => ({
        stockCode: "005930", date: "2026-07-02", time, value, ...(saturated ? { saturated } : {}),
    });
    const key = (time: string): string => `005930|2026-07-02|${time}`;

    it("포화는 실측 최대 다음 한 칸 — 척도를 찌그러뜨리지 않고 실측 위에 선다", () => {
        // 서버가 준 하한(4)이 실측 최대(12)보다 작아도 자리는 위여야 한다.
        const v = computedAxisView(feed({ values: [pt("09:00:00", 12), pt("09:10:00", 4, true)] }));
        expect(v.values.get(key("09:10:00"))).toBe(13);
        expect(v.values.get(key("09:00:00"))).toBe(12);
    });

    it("포화끼리는 같은 칸 — slotId 가 같아 자동으로 동률", () => {
        const v = computedAxisView(feed({ values: [pt("09:00:00", 5), pt("09:10:00", 0, true), pt("09:20:00", 300, true)] }));
        const slots = v.line.filter((p) => p.time !== "09:00:00").map((p) => p.slotId);
        expect(new Set(slots).size).toBe(1);
    });

    it("포화는 ∞ 로 적는다 — 자리잡은 수가 실측 어디에도 없어 fmt 하나로 되짚힌다", () => {
        const v = computedAxisView(feed({ display: { suffix: "일", decimals: 0, signed: false }, values: [pt("09:00:00", 12), pt("09:10:00", 4, true)] }));
        expect(v.fmt(13)).toBe("∞");
        expect(v.fmt(12)).toBe("12일");
    });

    it("포화가 없으면 ∞ 가 안 나온다 — 아무 값도 포화로 오인되지 않게", () => {
        const v = computedAxisView(feed({ values: [pt("09:00:00", 12)] }));
        expect(v.fmt(13)).toBe("+13.0%");
    });

    it("전부 포화면 다 같은 칸(0) — 세울 실측 기준이 없다", () => {
        const v = computedAxisView(feed({ values: [pt("09:00:00", 5, true), pt("09:10:00", 400, true)] }));
        expect([...v.values.values()]).toEqual([0, 0]);
        expect(v.fmt(0)).toBe("∞");
    });
});
