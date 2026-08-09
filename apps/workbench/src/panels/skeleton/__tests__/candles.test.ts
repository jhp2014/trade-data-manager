import { describe, it, expect } from "vitest";
import { anchorCandles, memberCandles, candleWidth, candlesVisible, type RawBar, type MinuteOhlcSeries } from "../candles.js";

const bar = (time: string, o: number, h: number, l: number, c: number): RawBar =>
    ({ time, open: String(o), high: String(h), low: String(l), close: String(c) });

describe("anchorCandles — 원주가 분봉 → 뷰 공간", () => {
    // 전일 종가 100, 타점 09:30(570분)의 가격 120 → baseRate = +20%.
    const origin = { basePrice: 100, baseRate: 20, baseT: 570 };

    it("골격 피벗과 **같은 식**으로 환산된다 — 타점 종가는 정확히 원점(0,0)에 앉는다", () => {
        const [k] = anchorCandles([bar("09:30:00", 118, 122, 117, 120)], origin, { from: -60, to: 60 });
        expect(k.x).toBe(0);
        expect(k.c).toBeCloseTo(0); // 120 → +20% − 20 = 0
        expect(k.h).toBeCloseTo(2); // 122 → +22% − 20
        expect(k.l).toBeCloseTo(-3);
        expect(k.o).toBeCloseTo(-2);
    });

    it("창 밖은 버린다 — 화면 밖 400봉을 만들지 않는다", () => {
        const bars = [bar("09:00:00", 100, 100, 100, 100), bar("09:30:00", 120, 120, 120, 120), bar("11:00:00", 130, 130, 130, 130)];
        expect(anchorCandles(bars, origin, { from: -60, to: 10 }).map((k) => k.x)).toEqual([-30, 0]);
    });

    it("값이 하나라도 가격이 아니면 그 봉은 건너뛴다 — 반쪽 캔들은 지어낸 그림이다", () => {
        // ⚠ 빈 문자열이 특히 위험하다: Number("") === 0 이고 0은 유한해서, 소박한 검사면
        //   "0원 캔들"(−100% 꼬리)이 조용히 그려진다. 가격은 양수여야 한다는 조건이 이걸 막는다.
        const empty = { time: "09:31:00", open: "120", high: "", low: "119", close: "121" };
        const zero = { time: "09:32:00", open: "120", high: "121", low: "0", close: "121" };
        const junk = { time: "09:33:00", open: "120", high: "x", low: "119", close: "121" };
        expect(anchorCandles([empty, zero, junk], origin, { from: -60, to: 60 })).toEqual([]);
    });

    it("기준 가격이 0 이하면 그릴 수 없다(분모를 지어내지 않는다)", () => {
        expect(anchorCandles([bar("09:30:00", 1, 1, 1, 1)], { ...origin, basePrice: 0 }, { from: -60, to: 60 })).toEqual([]);
    });
});

describe("memberCandles — 스냅샷 %(이미 % 공간) → 평행이동만", () => {
    const series: MinuteOhlcSeries = {
        index: new Map([[569, 0], [570, 1], [572, 2]]), // 571분은 거래 없음
        open: [4, 5, 9],
        high: [6, 8, 11],
        low: [3, 5, 8],
        close: [5, 7, 10],
    };

    it("앵커의 (t₀, baseRate)만큼 옮긴다 — 세로 간격(등락률 %p 차)이 보존된다", () => {
        const out = memberCandles(569, 572, series, { baseRate: 20, baseT: 570 });
        expect(out[0]).toEqual({ x: -1, o: -16, h: -14, l: -17, c: -15 });
        expect(out[1].x).toBe(0);
        expect(out[1].c).toBe(-13); // 7% − 20%p
    });

    it("거래가 없어 빠진 분은 건너뛴다 — 직전 값으로 봉을 지어내지 않는다", () => {
        expect(memberCandles(569, 572, series, { baseRate: 0, baseT: 570 }).map((k) => k.x)).toEqual([-1, 0, 2]);
    });

    it("구간 밖은 안 그린다", () => {
        expect(memberCandles(570, 570, series, { baseRate: 0, baseT: 570 })).toHaveLength(1);
    });
});

describe("candleWidth / candlesVisible — 축소하면 선으로 떨어진다", () => {
    it("1분 폭의 70%, 상한 9px", () => {
        expect(candleWidth(4)).toBeCloseTo(2.8);
        expect(candleWidth(40)).toBe(9);
    });

    it("몸통이 1.5px 미만이면 캔들을 접는다 — 붙어서 잉크 덩어리가 될 뿐", () => {
        expect(candlesVisible(3)).toBe(true);
        expect(candlesVisible(2)).toBe(false); // 1.4px
    });
});
