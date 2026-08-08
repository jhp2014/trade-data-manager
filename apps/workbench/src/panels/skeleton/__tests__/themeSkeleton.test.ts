import { describe, it, expect } from "vitest";
import { memberPath, themeLines, hotCodesInRange, type MinuteSeries, type ThemeSourceStock } from "../themeSkeleton.js";

/** 벽시계 분 = from + i 인 단순 시계열(환산은 minuteOfDayOf 의 몫이라 여기선 안 본다). */
const seriesOf = (from: number, close: number[]): MinuteSeries => ({
    index: new Map(close.map((_, i) => [from + i, i])),
    close,
});

describe("memberPath — 구간의 분당 종가 전부", () => {
    it("축약하지 않는다 — 손으로 고른 변곡점이 없는 멤버에겐 근사할 이유가 없다", () => {
        const s = seriesOf(540, [0, 1, 2, 4, 6]);
        expect(memberPath(540, 544, s)).toEqual([
            { x: 540, y: 0 }, { x: 541, y: 1 }, { x: 542, y: 2 }, { x: 543, y: 4 }, { x: 544, y: 6 },
        ]);
    });

    it("구간 밖은 안 그린다 — 앵커 골격이 그린 시간만이 비교 대상", () => {
        const s = seriesOf(540, [0, 1, 2, 4, 6]);
        expect(memberPath(541, 543, s)!.map((p) => p.x)).toEqual([541, 542, 543]);
    });

    it("거래가 없어 빠진 분은 건너뛴다 — 직전 값을 끌어오면 없던 평평한 구간이 사실처럼 보인다", () => {
        const s: MinuteSeries = { index: new Map([[540, 0], [543, 1]]), close: [0, 9] };
        expect(memberPath(540, 543, s)).toEqual([{ x: 540, y: 0 }, { x: 543, y: 9 }]);
    });

    it("점이 2개 미만이면 선이 아니다", () => {
        expect(memberPath(900, 910, seriesOf(540, [0, 1, 2]))).toBeNull();
        expect(memberPath(540, 540, seriesOf(540, [0, 1, 2]))).toBeNull();
    });
});

describe("hotCodesInRange — 그 구간에 한 번이라도 떴던 종목", () => {
    const stock = (code: string, rate: number[], amount: number[], themes: string[] = ["T"]): ThemeSourceStock => ({
        code, themes, name: code,
        times: rate.map((_, i) => i * 60), // 아래 toMin 이 분 = i 로 되돌린다
        rate, cumAmount: amount,
    });
    const toMin = (unix: number): number => unix / 60;
    // 거래대금 1위만 뽑는 가짜 판정 — 실제 selectHotUniverse 규칙은 core 테스트가 지킨다.
    const topAmount = (snaps: { code: string; amount: number; changeRate: number }[]): Set<string> =>
        new Set([[...snaps].sort((a, b) => b.amount - a.amount)[0].code]);

    it("구간 전체의 **합집합** — 한 순간만 떴어도 든다", () => {
        const stocks = [stock("A", [1, 1, 1], [10, 10, 10]), stock("B", [1, 1, 1], [0, 99, 0])];
        expect(hotCodesInRange(stocks, 0, 2, toMin, topAmount)).toEqual(new Set(["A", "B"]));
    });

    it("구간을 좁히면 그 순간의 것만 남는다", () => {
        const stocks = [stock("A", [1, 1, 1], [10, 10, 10]), stock("B", [1, 1, 1], [0, 99, 0])];
        expect(hotCodesInRange(stocks, 0, 0, toMin, topAmount)).toEqual(new Set(["A"]));
    });
});

describe("themeLines", () => {
    const mk = (code: string, themes: string[], rate: number[]): ThemeSourceStock => ({
        code, themes, name: `${code}이름`,
        times: rate.map((_, i) => i * 60),
        rate, cumAmount: rate.map(() => 0),
    });
    const toMin = (unix: number): number => unix / 60;
    const anchor = {
        key: "A|2026-08-05", chartKey: "A|2026-08-05", stockCode: "A", date: "2026-08-05",
        basePrice: 100, baseT: 0, points: [{ x: 0, y: 0 }, { x: 4, y: 10 }],
    };

    it("앵커와 테마가 겹치고 그 구간에 떴던 종목만 — 앵커 자신은 뺀다", () => {
        const stocks = [
            mk("A", ["반도체"], [0, 2, 5, 8, 10]),
            mk("B", ["반도체"], [0, 1, 3, 5, 6]), // 테마 겹침 + hot
            mk("C", ["바이오"], [0, 1, 2, 3, 4]), // 테마 다름
            mk("D", ["반도체"], [0, 1, 2, 3, 4]), // 테마 겹치나 hot 아님
        ];
        const lines = themeLines(anchor, stocks, new Set(["A", "B", "C"]), toMin);
        expect(lines.map((l) => l.code)).toEqual(["B"]);
        expect(lines[0].name).toBe("B이름");
    });

    it("구간은 앵커 피벗의 처음~끝, y 는 등락률 그대로 — 절대 배치와 같은 공간이라 환산이 없다", () => {
        const stocks = [mk("A", ["T"], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 5, 5, 5, 20])];
        const [line] = themeLines(anchor, stocks, new Set(["B"]), toMin);
        expect(line.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 20 }]);
    });

    it("앵커 피벗이 하루의 일부만 덮으면 테마 선도 그만큼만", () => {
        const short = { ...anchor, points: [{ x: 1, y: 0 }, { x: 3, y: 5 }] };
        const stocks = [mk("A", ["T"], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 5, 6, 7, 20])];
        expect(themeLines(short, stocks, new Set(["B"]), toMin)[0].points.map((p) => p.x)).toEqual([1, 2, 3]);
    });

    it("앵커가 테마를 하나도 안 가지면 아무것도 안 그린다", () => {
        const stocks = [mk("A", [], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 1, 2, 3, 4])];
        expect(themeLines(anchor, stocks, new Set(["B"]), toMin)).toEqual([]);
    });

    it("앵커가 그날 유니버스 밖이면(스냅샷에 없음) 테마를 알 수 없다 — 빈 목록", () => {
        expect(themeLines(anchor, [mk("B", ["T"], [0, 1])], new Set(["B"]), toMin)).toEqual([]);
    });
});
