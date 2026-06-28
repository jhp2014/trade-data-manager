import { describe, it, expect } from "vitest";
import { RoutingMinuteProvider } from "../routingMinuteProvider.js";
import type { MinuteCandle, MinuteCandleProvider } from "@trade-data-manager/market";

/** 어느 벤더가 불렸는지 기록하는 스텁. */
function stub(tag: string, calls: string[]): MinuteCandleProvider {
    return {
        async getMinuteCandles(stockCode, date) {
            calls.push(`${tag}:${stockCode}:${date}`);
            return [] as MinuteCandle[];
        },
    };
}

const NOW = () => new Date("2026-06-28T00:00:00Z");

describe("RoutingMinuteProvider.route", () => {
    it("작년 같은 달(6월) 이하는 키움 단독", () => {
        const r = new RoutingMinuteProvider(stub("kw", []), stub("kis", []), { now: NOW });
        // 오늘 2026-06 기준 2025-06 = 12개월 전 → 키움 단독(월 단위, 일자 무관)
        expect(r.route("005930", "2025-06-30")).toBe("kiwoom");
        expect(r.route("005930", "2025-06-02")).toBe("kiwoom");
        expect(r.route("005930", "2025-05-01")).toBe("kiwoom"); // 더 옛달도 키움행
    });

    it("작년 같은 달보다 최근(2025-07~)은 라운드로빈(키움/KIS 둘 다 나온다)", () => {
        const r = new RoutingMinuteProvider(stub("kw", []), stub("kis", []), { now: NOW });
        const codes = ["005930", "000660", "035720", "005380", "051910", "207940"];
        const picks = new Set(codes.map((c) => r.route(c, "2025-07-01")));
        expect(picks.has("kiwoom")).toBe(true);
        expect(picks.has("kis")).toBe(true);
    });

    it("같은 (종목,날)은 항상 같은 벤더(결정적)", () => {
        const r = new RoutingMinuteProvider(stub("kw", []), stub("kis", []), { now: NOW });
        expect(r.route("005930", "2026-06-20")).toBe(r.route("005930", "2026-06-20"));
    });

    it("thresholdMonths 설정 노브가 동작", () => {
        const r = new RoutingMinuteProvider(stub("kw", []), stub("kis", []), { now: NOW, thresholdMonths: 1 });
        expect(r.route("005930", "2026-05-31")).toBe("kiwoom"); // 1개월 전 ≥ 1
    });
});

describe("RoutingMinuteProvider.getMinuteCandles", () => {
    it("결정된 벤더로만 위임", async () => {
        const calls: string[] = [];
        const r = new RoutingMinuteProvider(stub("kw", calls), stub("kis", calls), { now: NOW });
        await r.getMinuteCandles("005930", "2025-06-02"); // 작년 6월 = 키움 단독 구간
        expect(calls).toEqual(["kw:005930:2025-06-02"]);
    });
});
