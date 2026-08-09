import { describe, it, expect } from "vitest";
import { anchorCandles, memberCandles, dailyOverlayCandles, candleWidth, CANDLE_MIN_WIDTH, type RawMinute, type MinuteOhlcSeries, type RawDaily } from "../candles.js";

const bar = (time: string, o: number, h: number, l: number, c: number, volume = 100): RawMinute =>
    ({ time, un: { open: String(o), high: String(h), low: String(l), close: String(c), volume: String(volume) } });

describe("anchorCandles — 원주가 분봉 → 뷰 공간", () => {
    // 전일 종가 100, 타점 09:30(570분)의 가격 120 → baseRate = +20%.
    const origin = { basePrice: 100, baseRate: 20, baseT: 570 };

    it("골격 피벗과 **같은 식**으로 환산된다 — 타점 종가는 정확히 원점(0,0)에 앉는다", () => {
        const [k] = anchorCandles([bar("09:30:00", 118, 122, 117, 120)], origin);
        expect(k.x).toBe(0);
        expect(k.c).toBeCloseTo(0); // 120 → +20% − 20 = 0
        expect(k.h).toBeCloseTo(2); // 122 → +22% − 20
        expect(k.l).toBeCloseTo(-3);
        expect(k.o).toBeCloseTo(-2);
    });

    it("거래대금 = 도메인 공식(OHLC평균×량) — 스냅샷 cumAmount 와 같은 함수라 두 경로가 안 갈린다", () => {
        // (100+110+90+100)/4 = 100 → ×1000 = 100,000
        const [k] = anchorCandles([bar("09:30:00", 100, 110, 90, 100, 1000)], origin);
        expect(k.amount).toBe(100_000);
    });

    it("**자르지 않는다** — 하루치 전부(20시까지). 초기 창으로 자르면 확대·이동해도 그 밖은 영영 빈 화면", () => {
        const bars = [bar("09:00:00", 100, 100, 100, 100), bar("09:30:00", 120, 120, 120, 120), bar("19:59:00", 130, 130, 130, 130)];
        expect(anchorCandles(bars, origin).map((k) => k.x)).toEqual([-30, 0, 629]);
    });

    it("거래량 0(평탄 채움봉)도 그린다 — 모든 시간에 캔들이 있다(사용자 확정)", () => {
        const [k] = anchorCandles([bar("09:31:00", 120, 120, 120, 120, 0)], origin);
        expect(k).toMatchObject({ x: 1, amount: 0 });
        expect(k.o).toBeCloseTo(k.c); // 평탄봉
    });

    it("값이 하나라도 가격이 아니면 그 봉은 건너뛴다 — 반쪽 캔들은 지어낸 그림이다", () => {
        // ⚠ 빈 문자열이 특히 위험하다: Number("") === 0 이고 0은 유한해서, 소박한 검사면
        //   "0원 캔들"(−100% 꼬리)이 조용히 그려진다. 가격은 양수여야 한다는 조건이 이걸 막는다.
        const empty = { time: "09:31:00", un: { open: "120", high: "", low: "119", close: "121", volume: "1" } };
        const zero = { time: "09:32:00", un: { open: "120", high: "121", low: "0", close: "121", volume: "1" } };
        const junk = { time: "09:33:00", un: { open: "120", high: "x", low: "119", close: "121", volume: "1" } };
        expect(anchorCandles([empty, zero, junk], origin)).toEqual([]);
    });

    it("기준 가격이 0 이하면 그릴 수 없다(분모를 지어내지 않는다)", () => {
        expect(anchorCandles([bar("09:30:00", 1, 1, 1, 1)], { ...origin, basePrice: 0 })).toEqual([]);
    });
});

describe("memberCandles — 스냅샷 %(이미 % 공간) → 평행이동 + 평탄 채움", () => {
    const series: MinuteOhlcSeries = {
        index: new Map([[569, 0], [570, 1], [572, 2]]), // 571분은 거래 없음
        open: [4, 5, 9],
        high: [6, 8, 11],
        low: [3, 5, 8],
        close: [5, 7, 10],
        cumAmount: [1000, 3000, 3500],
    };

    it("앵커의 (t₀, baseRate)만큼 옮긴다 — 세로 간격(등락률 %p 차)이 보존된다", () => {
        const out = memberCandles(569, 572, series, { baseRate: 20, baseT: 570 });
        expect(out[0]).toMatchObject({ x: -1, o: -16, h: -14, l: -17, c: -15 });
        expect(out[1].x).toBe(0);
        expect(out[1].c).toBe(-13); // 7% − 20%p
    });

    it("빠진 분은 **직전 종가 평탄봉**으로 채운다(사용자 확정) — 모든 시간에 캔들", () => {
        const out = memberCandles(569, 572, series, { baseRate: 0, baseT: 570 });
        expect(out.map((k) => k.x)).toEqual([-1, 0, 1, 2]);
        const filled = out[2]; // 571분
        expect(filled).toEqual({ x: 1, o: 7, h: 7, l: 7, c: 7, amount: 0 }); // 직전 종가 7%
    });

    it("첫 값 이전(선두 갭)은 못 채운다 — 끌어올 직전 값이 없다", () => {
        expect(memberCandles(566, 570, series, { baseRate: 0, baseT: 570 }).map((k) => k.x)).toEqual([-1, 0]);
    });

    it("**마지막 봉 이후(후미 갭)도 안 채운다** — 장 끝난 뒤 20시 이후까지 평탄봉이 서던 문제", () => {
        expect(memberCandles(569, 600, series, { baseRate: 0, baseT: 570 }).map((k) => k.x)).toEqual([-1, 0, 1, 2]);
    });

    it("거래대금은 누적의 인접 차분 — 첫 봉은 누적 그대로", () => {
        const out = memberCandles(569, 572, series, { baseRate: 0, baseT: 570 });
        expect(out.map((k) => k.amount)).toEqual([1000, 2000, 0, 500]);
    });
});

describe("candleWidth — 축소해도 사라지지 않는다", () => {
    it("1분 폭의 70%, 상한 9px", () => {
        expect(candleWidth(4)).toBeCloseTo(2.8);
        expect(candleWidth(40)).toBe(9);
    });

    it("아무리 좁아도 하한을 지킨다(사용자 확정 — 폭 때문에 그림이 사라지지 않게)", () => {
        expect(candleWidth(0.1)).toBe(CANDLE_MIN_WIDTH);
        expect(candleWidth(0)).toBe(CANDLE_MIN_WIDTH);
    });
});

describe("dailyOverlayCandles — 일봉 → 뷰 공간(x = 창 안 거래일 순번)", () => {
    /** 시장 두 벌이 같은 값인 평범한 날. */
    const d = (o: number, h: number, l: number, c: number, amount = "0"): RawDaily => {
        const b = { open: String(o), high: String(h), low: String(l), close: String(c), amount };
        return { krx: b, un: b };
    };
    // 창 안 4일. 앵커 피벗은 인덱스 2(가격 120).
    const bars = [d(90, 95, 88, 92), d(92, 110, 91, 108), d(108, 125, 105, 120), d(120, 130, 115, 118)];

    it("배열 인덱스가 곧 t — x 는 앵커 순번 기준 상대 거래일", () => {
        const out = dailyOverlayCandles(bars, { basePrice: 120, baseT: 2 });
        expect(out.map((k) => k.x)).toEqual([-2, -1, 0, 1]);
    });

    it("y 는 앵커 가격 대비 % — 앵커 봉의 종가가 0% 에 앉는다", () => {
        const out = dailyOverlayCandles(bars, { basePrice: 120, baseT: 2 });
        expect(out[2].c).toBeCloseTo(0); // 종가 120 = 기준
        expect(out[0].c).toBeCloseTo(((92 - 120) / 120) * 100);
    });

    it("거래대금은 **실측 그대로** — 일봉은 OHLC×량으로 지어내지 않는다", () => {
        const withAmt = [d(90, 95, 88, 92, "12300000000")];
        expect(dailyOverlayCandles(withAmt, { basePrice: 92, baseT: 0 })[0].amount).toBe(12_300_000_000);
    });

    it("시장은 **앵커 피벗이 앉는 쪽** — 기준가가 UN 봉 밖이고 KRX 봉 안이면 KRX 를 쓴다", () => {
        // UN 은 200~210, KRX 는 90~130. 기준가 120 은 KRX 봉에만 든다.
        const split: RawDaily[] = [{
            krx: { open: "100", high: "130", low: "90", close: "120", amount: "0" },
            un: { open: "205", high: "210", low: "200", close: "208", amount: "0" },
        }];
        expect(dailyOverlayCandles(split, { basePrice: 120, baseT: 0 })[0].c).toBeCloseTo(0);
    });

    it("둘 다 담으면 UN(통합)을 쓴다 — 규칙이 흔들리지 않게", () => {
        const both: RawDaily[] = [{
            krx: { open: "100", high: "130", low: "90", close: "110", amount: "0" },
            un: { open: "100", high: "130", low: "90", close: "126", amount: "0" },
        }];
        expect(dailyOverlayCandles(both, { basePrice: 120, baseT: 0 })[0].c).toBeCloseTo(5);
    });

    it("값이 하나라도 가격이 아니면 그 봉은 건너뛴다 — 반쪽 캔들은 지어낸 그림이다", () => {
        const broken: RawDaily[] = [d(90, 95, 88, 92), { krx: d(0, 0, 0, 0).krx, un: { open: "", high: "9", low: "8", close: "9", amount: "0" } }];
        expect(dailyOverlayCandles(broken, { basePrice: 92, baseT: 0 })).toHaveLength(1);
    });

    it("기준가가 없거나 봉이 없으면 빈 목록", () => {
        expect(dailyOverlayCandles(bars, { basePrice: 0, baseT: 0 })).toEqual([]);
        expect(dailyOverlayCandles([], { basePrice: 100, baseT: 0 })).toEqual([]);
    });
});
