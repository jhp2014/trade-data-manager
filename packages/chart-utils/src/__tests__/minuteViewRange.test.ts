import { describe, it, expect } from "vitest";
import { computeMinuteViewRange } from "../minuteViewRange";
import { kstMinutesOfDay } from "../chartTime";
import type { MinuteCandle } from "../types";

// KST 2024-01-02 00:00 = unix 1704121200 (UTC 2024-01-01 15:00).
const KST_MIDNIGHT = 1704121200;
/** 해당 트레이드일 KST HH:MM 의 unix(초). */
const at = (hh: number, mm = 0) => KST_MIDNIGHT + (hh * 60 + mm) * 60;

function candle(unix: number): MinuteCandle {
    const z = { open: 0, high: 0, low: 0, close: 0 };
    return { time: unix, krx: z, nxt: z };
}

describe("kstMinutesOfDay", () => {
    it("KST 자정 이후 분으로 변환", () => {
        expect(kstMinutesOfDay(at(0, 0))).toBe(0);
        expect(kstMinutesOfDay(at(9, 0))).toBe(540);
        expect(kstMinutesOfDay(at(15, 30))).toBe(930);
    });
});

describe("computeMinuteViewRange", () => {
    it("캔들이 없으면 null", () => {
        expect(computeMinuteViewRange([], { variant: "KRX" })).toBeNull();
    });

    it("KRX 전용 종목(정규장 내 봉만)은 클립 없이 전체 + 좌측 여백", () => {
        const candles = [candle(at(9, 0)), candle(at(12, 0)), candle(at(15, 30))];
        // 정규장 밖 봉이 없으므로 from=0-10, to=lastIdx(2)+2
        expect(computeMinuteViewRange(candles, { variant: "KRX" })).toEqual({ from: -10, to: 4 });
    });

    it("NXT 종목 KRX 캡처는 08:00~15:30으로 클립(애프터마켓 제외)", () => {
        const candles = [
            candle(at(8, 0)),   // 0 - 프리마켓
            candle(at(9, 0)),   // 1
            candle(at(15, 30)), // 2 - 정규장 종료
            candle(at(16, 0)),  // 3 - 애프터마켓 (제외)
            candle(at(20, 0)),  // 4 - 애프터마켓 (제외)
        ];
        // fromIdx=0(08:00), toIdx=2(15:30) → from=0-10, to=2+2
        expect(computeMinuteViewRange(candles, { variant: "KRX" })).toEqual({ from: -10, to: 4 });
    });

    it("NXT variant는 클립하지 않고 전체(애프터마켓 포함)", () => {
        const candles = [
            candle(at(8, 0)),   // 0
            candle(at(15, 30)), // 1
            candle(at(20, 0)),  // 2
        ];
        // variant !== KRX → 클립 없음. from=0-10, to=lastIdx(2)+2
        expect(computeMinuteViewRange(candles, { variant: "NXT" })).toEqual({ from: -10, to: 4 });
    });

    it("padBars/rightPadBars 조정 가능", () => {
        const candles = [candle(at(9, 0)), candle(at(15, 30))];
        expect(computeMinuteViewRange(candles, { variant: "KRX", padBars: 5, rightPadBars: 0 }))
            .toEqual({ from: -5, to: 1 });
    });
});
