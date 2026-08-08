import { describe, it, expect } from "vitest";
import { refineBetween, memberPath, themeLines, hotCodesInRange, type MinuteSeries, type ThemeSourceStock } from "../themeSkeleton.js";

// 벽시계 분 = 인덱스인 단순 시계열 만들기(테스트는 환산을 안 본다 — 그건 minuteOfDayOf 의 몫).
const seriesOf = (from: number, close: number[], high?: number[], low?: number[]): MinuteSeries => ({
    index: new Map(close.map((_, i) => [from + i, i])),
    close,
    high: high ?? close,
    low: low ?? close,
});

describe("refineBetween — 오차 기반 재귀 세분", () => {
    it("직선으로 흘렀으면 점이 하나도 안 생긴다 — 균등 격자와 갈리는 지점", () => {
        const s = seriesOf(0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(refineBetween(0, 0, 10, 10, s, { tolerance: 0.5 })).toEqual([]);
    });

    it("가장 많이 벗어난 지점이 반드시 들어간다 — 그게 곧 그 구간의 극단", () => {
        // 5분에 +8 로 튀었다 되돌아온 경로. 출력은 **시간순**이라 극단이 배열 첫 항목은 아니다
        // (첫 점을 찍은 뒤 갈린 두 구간을 다시 세분하므로 앞쪽 점들이 먼저 온다).
        const s = seriesOf(0, [0, 1, 2, 4, 6, 8, 6, 4, 2, 1, 0]);
        expect(refineBetween(0, 0, 10, 0, s, { tolerance: 1 })).toContainEqual({ x: 5, y: 8 });
    });

    it("허용 오차를 낮추면 점이 늘어난다 — 손잡이는 이 하나뿐", () => {
        const s = seriesOf(0, [0, 1, 2, 4, 6, 8, 6, 4, 2, 1, 0]);
        const coarse = refineBetween(0, 0, 10, 0, s, { tolerance: 5 });
        const fine = refineBetween(0, 0, 10, 0, s, { tolerance: 0.5 });
        expect(fine.length).toBeGreaterThan(coarse.length);
    });

    it("분 안의 꼬리도 후보 — 종가만 보면 못 잡는 움직임을 고가/저가가 잡는다", () => {
        // 종가는 내내 0인데 5분에 고가만 +9 를 찍었다. 뾰족한 스파이크라 점 셋(올라가기 전·꼭대기·내려온 뒤)이
        // 생기는 게 맞다 — 꼭대기 하나만 넣으면 선이 양옆으로 비스듬히 늘어져 없던 완만한 상승을 그린다.
        const s = seriesOf(0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0]);
        const got = refineBetween(0, 0, 10, 0, s, { tolerance: 1 });
        expect(got).toContainEqual({ x: 5, y: 9 });
        expect(got.filter((p) => p.y === 0).length).toBeGreaterThanOrEqual(2); // 스파이크 양옆의 바닥
    });

    it("저가 쪽 이탈도 같은 무게로 잡힌다 — 고가만 보면 그림이 위로 기운다", () => {
        const s = seriesOf(0, new Array(11).fill(0), undefined, [0, 0, 0, 0, 0, -9, 0, 0, 0, 0, 0]);
        expect(refineBetween(0, 0, 10, 0, s, { tolerance: 1 })).toContainEqual({ x: 5, y: -9 });
    });

    it("점은 시간순이고 끝점은 안 넣는다(호출측이 넣는다)", () => {
        const s = seriesOf(0, [0, 5, 2, 9, 1, 8, 3, 7, 0, 6, 0]);
        const got = refineBetween(0, 0, 10, 0, s, { tolerance: 0.5 });
        expect(got.map((p) => p.x)).toEqual([...got.map((p) => p.x)].sort((a, b) => a - b));
        expect(got.some((p) => p.x === 0 || p.x === 10)).toBe(false);
    });

    it("상한이 재귀를 막는다 — 톱니 경로가 구간당 점을 무한히 낳지 않게", () => {
        const saw = Array.from({ length: 61 }, (_, i) => (i % 2 === 0 ? 0 : 10));
        const s = seriesOf(0, saw);
        expect(refineBetween(0, 0, 60, 0, s, { tolerance: 0.1, maxPerSegment: 4 }).length).toBeLessThanOrEqual(4);
    });

    it("붙어 있는 두 분 사이엔 넣을 자리가 없다", () => {
        expect(refineBetween(0, 0, 1, 5, seriesOf(0, [0, 5]), { tolerance: 0.01 })).toEqual([]);
    });
});

describe("memberPath — 앵커 피벗에 세우고 사이를 채운다", () => {
    const s = seriesOf(0, [0, 1, 2, 4, 6, 8, 6, 4, 2, 1, 0]);

    it("피벗 시각이 그대로 들어가고 사이가 채워진다", () => {
        const p = memberPath([0, 10], s, { tolerance: 1 })!;
        expect(p[0]).toEqual({ x: 0, y: 0 });
        expect(p[p.length - 1]).toEqual({ x: 10, y: 0 });
        expect(p.length).toBeGreaterThan(2);
    });

    it("분봉에 없는 피벗 시각은 건너뛴다 — 지어내지 않는다", () => {
        const p = memberPath([0, 999, 10], s, { tolerance: 99 })!;
        expect(p.map((q) => q.x)).toEqual([0, 10]);
    });

    it("남는 점이 2개 미만이면 선이 아니다", () => {
        expect(memberPath([999, 1000], s, { tolerance: 1 })).toBeNull();
        expect(memberPath([5], s, { tolerance: 1 })).toBeNull();
    });
});

describe("hotCodesInRange — 그 구간에 한 번이라도 떴던 종목", () => {
    const stock = (code: string, rate: number[], amount: number[], themes: string[] = ["T"]): ThemeSourceStock => ({
        code, themes, name: code,
        times: rate.map((_, i) => i * 60), // 분 = i (아래 toMinuteOfDay 가 그렇게 환산)
        rate, minuteHigh: rate, minuteLow: rate, cumAmount: amount,
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
        rate, minuteHigh: rate, minuteLow: rate, cumAmount: rate.map(() => 0),
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
        const lines = themeLines(anchor, stocks, new Set(["A", "B", "C"]), toMin, { tolerance: 99 });
        expect(lines.map((l) => l.code)).toEqual(["B"]);
        expect(lines[0].name).toBe("B이름");
    });

    it("y 는 등락률 그대로 — 절대 배치와 같은 공간이라 환산이 없다", () => {
        const stocks = [mk("A", ["T"], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 5, 5, 5, 20])];
        const [line] = themeLines(anchor, stocks, new Set(["B"]), toMin, { tolerance: 99 });
        // 앵커 피벗 시각(0분·4분)에 세운 두 끝점 — 허용 오차가 커서 사이는 안 채워진다.
        expect(line.points).toEqual([{ x: 0, y: 0 }, { x: 4, y: 20 }]);
    });

    it("앵커가 테마를 하나도 안 가지면 아무것도 안 그린다", () => {
        const stocks = [mk("A", [], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 1, 2, 3, 4])];
        expect(themeLines(anchor, stocks, new Set(["B"]), toMin, { tolerance: 1 })).toEqual([]);
    });

    it("앵커가 그날 유니버스 밖이면(스냅샷에 없음) 테마를 알 수 없다 — 빈 목록", () => {
        expect(themeLines(anchor, [mk("B", ["T"], [0, 1])], new Set(["B"]), toMin, { tolerance: 1 })).toEqual([]);
    });
});
