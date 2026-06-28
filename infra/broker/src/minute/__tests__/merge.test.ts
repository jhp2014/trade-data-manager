import { describe, it, expect } from "vitest";
import { mergeMarkets, type TimeBar } from "../merge.js";
import type { MinuteBar } from "@trade-data-manager/market";

const bar = (close: string): MinuteBar => ({
    open: close,
    high: close,
    low: close,
    close,
    volume: "1",
});
const tb = (time: string, close: string): TimeBar => ({ time, bar: bar(close) });

describe("mergeMarkets", () => {
    it("UN 시각 기준으로 KRX 를 붙이고 시간 오름차순 정렬", () => {
        const krx = [tb("09:01:00", "100"), tb("09:00:00", "99")];
        const un = [tb("09:00:00", "199"), tb("09:01:00", "200")];
        const out = mergeMarkets("005930", "2026-06-26", krx, un);
        expect(out.map((c) => c.time)).toEqual(["09:00:00", "09:01:00"]);
        expect(out[0].un).toEqual(bar("199"));
        expect(out[0].krx).toEqual(bar("99"));
    });

    it("KRX 없는 시각(NXT 단독)은 krx=null", () => {
        const un = [tb("08:00:00", "100"), tb("09:00:00", "105")];
        const krx = [tb("09:00:00", "105")];
        const out = mergeMarkets("005930", "2026-06-26", krx, un);
        const pre = out.find((c) => c.time === "08:00:00")!;
        expect(pre.krx).toBeNull();
        expect(pre.un).toEqual(bar("100"));
    });

    it("UN 에 없는 시각의 KRX 는 무시(UN 이 정본)", () => {
        const un = [tb("09:00:00", "100")];
        const krx = [tb("09:00:00", "100"), tb("09:01:00", "101")];
        const out = mergeMarkets("005930", "2026-06-26", krx, un);
        expect(out).toHaveLength(1);
        expect(out[0].time).toBe("09:00:00");
    });
});
