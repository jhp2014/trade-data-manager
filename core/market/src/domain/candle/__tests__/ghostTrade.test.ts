import { describe, it, expect } from "vitest";
import { ghostFixOf } from "../ghostTrade.js";
import type { MinuteBar, MinuteCandle } from "../model.js";

const bar = (o: number, h: number, l: number, c: number, v = 100): MinuteBar => ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: String(v) });
const nxt = (time: string, b: MinuteBar): MinuteCandle => ({ stockCode: "000660", date: "2026-07-28", time, krx: null, un: b });
const krx = (time: string, b: MinuteBar): MinuteCandle => ({ stockCode: "000660", date: "2026-07-28", time, krx: b, un: b });

describe("ghostFixOf", () => {
    it("유령이 없으면 null — 정상 갭하락 시작(1.2%)은 걷지 않는다", () => {
        expect(ghostFixOf([nxt("08:00:00", bar(218000, 218000, 214500, 215500)), nxt("08:01:00", bar(216000, 216000, 215000, 215000)), krx("09:00:00", bar(215000, 216000, 214000, 215500))])).toBeNull();
    });

    it("평평한 유령 고가(첫 체결) — 고가와 시가를 함께 고친다", () => {
        const fix = ghostFixOf([
            nxt("08:00:00", bar(25000, 25000, 25000, 25000, 1)),
            nxt("08:01:00", bar(20900, 21000, 20800, 20950)),
            krx("09:00:00", bar(20950, 21100, 20900, 21000)),
        ]);
        expect(fix).toEqual({ open: "20900", high: "21100", removed: ["08:00:00"] });
    });

    it("연속으로 튄 분은 차례로 걷히고, 아래로 튄 첫 체결은 저가·시가를 고친다 (7/28 SK하이닉스 꼴)", () => {
        const fix = ghostFixOf([
            nxt("08:00:00", bar(1272000, 1272000, 1272000, 1272000, 1)),
            nxt("08:02:00", bar(1746000, 1756000, 1706000, 1756000, 9)),
            nxt("08:04:00", bar(1756000, 1759000, 1746000, 1756000, 99)),
            nxt("08:06:00", bar(1690000, 1695000, 1663000, 1671000, 100806)),
            nxt("08:07:00", bar(1671000, 1678000, 1670000, 1672000, 71515)),
            krx("09:00:00", bar(1662000, 1674000, 1550000, 1600000, 500000)),
        ]);
        expect(fix).toEqual({ open: "1690000", high: "1695000", low: "1550000", removed: ["08:00:00", "08:02:00", "08:04:00"] });
    });

    it("KRX 세션 분은 3% 넘게 벌어져도(VI) 걷지 않는다", () => {
        expect(ghostFixOf([nxt("08:00:00", bar(110, 110, 109, 110)), krx("09:30:00", bar(110, 120, 110, 120)), krx("09:32:00", bar(112, 113, 111, 112))])).toBeNull();
    });

    it("같은 분 안에서 튀고 내려온 꼴은 걷지 않는다(종가 vs 다음 시가만)", () => {
        expect(ghostFixOf([nxt("08:00:00", bar(49950, 49950, 47100, 47100, 21)), nxt("08:01:00", bar(47100, 47200, 47000, 47150)), krx("09:00:00", bar(47150, 47300, 47000, 47200))])).toBeNull();
    });

    it("저녁 체결은 NXT 단독이든 KRX 봉이 있든 3% 넘게 벌어져도 걷지 않는다", () => {
        expect(ghostFixOf([krx("09:00:00", bar(100, 101, 99, 100)), nxt("15:45:00", bar(130, 130, 130, 130, 1)), nxt("15:46:00", bar(100, 101, 99, 100))])).toBeNull();
        expect(ghostFixOf([krx("09:00:00", bar(100, 101, 99, 100)), krx("16:04:00", bar(130, 130, 130, 130, 1)), krx("16:10:00", bar(100, 101, 99, 100))])).toBeNull();
        expect(ghostFixOf([krx("09:00:00", bar(100, 101, 99, 100)), nxt("19:32:00", bar(70, 70, 70, 70, 1)), nxt("19:33:00", bar(100, 101, 99, 100))])).toBeNull();
    });

    it("오전 유령을 걷은 뒤 남은 극값이 저녁이면 그 값이 UN* 가 된다", () => {
        const fix = ghostFixOf([nxt("08:00:00", bar(130, 130, 130, 130, 1)), krx("09:00:00", bar(100, 101, 99, 100)), krx("16:04:00", bar(120, 120, 120, 120, 1)), krx("16:10:00", bar(100, 101, 99, 100))]);
        expect(fix).toEqual({ open: "100", high: "120", removed: ["08:00:00"] });
    });

    it("KRX 분봉이 하루 내내 없어도 프리장만 유령 후보로 본다", () => {
        const fix = ghostFixOf([nxt("08:00:00", bar(130, 130, 130, 130, 1)), nxt("08:01:00", bar(100, 101, 99, 100)), nxt("10:00:00", bar(100, 102, 99, 101))]);
        expect(fix).toEqual({ open: "100", high: "102", removed: ["08:00:00"] });
    });

    it("장중에 KRX 체결 없이 NXT 만 찍힌 분은 3% 넘게 벌어져도 걷지 않는다(거래 드문 종목)", () => {
        expect(ghostFixOf([krx("09:00:00", bar(100, 101, 99, 100)), nxt("10:15:00", bar(110, 110, 110, 110)), krx("10:16:00", bar(100, 101, 99, 100))])).toBeNull();
    });

    it("같은 값의 유령이 연달아 있으면 둘 다 걷는다", () => {
        const fix = ghostFixOf([nxt("08:00:00", bar(130, 130, 130, 130, 1)), nxt("08:01:00", bar(130, 130, 130, 130, 1)), nxt("08:02:00", bar(100, 101, 99, 100)), krx("09:00:00", bar(100, 102, 99, 101))]);
        expect(fix).toEqual({ open: "100", high: "102", removed: ["08:00:00", "08:01:00"] });
    });

    it("첫 분이 아닌 저가 유령 — 저가만 고치고 시가는 그대로", () => {
        const fix = ghostFixOf([nxt("08:00:00", bar(100, 101, 99, 100)), nxt("08:01:00", bar(80, 80, 80, 80, 1)), nxt("08:02:00", bar(100, 101, 98, 100)), krx("09:00:00", bar(100, 102, 97, 101))]);
        expect(fix).toEqual({ low: "97", removed: ["08:01:00"] });
    });

    it("정확히 3% 는 걷고, 그 밑은 둔다 · 마지막 분이 극값이면 다음 분이 없어 둔다", () => {
        expect(ghostFixOf([nxt("08:00:00", bar(103, 103, 103, 103, 1)), nxt("08:01:00", bar(100, 101, 99, 100)), krx("09:00:00", bar(100, 101, 99, 100))])?.removed).toEqual(["08:00:00"]);
        expect(ghostFixOf([nxt("08:00:00", bar(102.9, 102.9, 102.9, 102.9, 1)), nxt("08:01:00", bar(100, 101, 99, 100)), krx("09:00:00", bar(100, 101, 99, 100))])).toBeNull();
        expect(ghostFixOf([nxt("08:00:00", bar(128, 128, 128, 128)), nxt("08:59:00", bar(130, 130, 130, 130, 1))])).toBeNull();
    });

    it("프리장 판정은 시각만 본다 — 09:00 전 분은 KRX 봉이 있어도 후보다(KRX 프리장이 열리면 다시 볼 자리)", () => {
        expect(ghostFixOf([krx("08:30:00", bar(130, 130, 130, 130, 1)), krx("09:00:00", bar(100, 101, 99, 100))])?.removed).toEqual(["08:30:00"]);
    });

    it("거래량 0 채움 봉은 체결이 아니라 다음 분으로 치지 않는다", () => {
        const fix = ghostFixOf([nxt("08:00:00", bar(130, 130, 130, 130, 1)), nxt("08:01:00", bar(130, 130, 130, 130, 0)), nxt("08:02:00", bar(100, 101, 99, 100)), krx("09:00:00", bar(100, 102, 99, 101))]);
        expect(fix?.removed).toEqual(["08:00:00"]);
    });
});
