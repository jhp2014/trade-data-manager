import { describe, it, expect } from "vitest";
import { memberPath, themeLines, hotCodesInRange, readingsAt, layoutAxisColumns, type MinuteSeries, type ThemeSourceStock } from "../themeSkeleton.js";

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

    it("거래가 없어 빠진 분은 **직전 종가로 채운다**(사용자 확정) — 건너뛰면 그 구간이 기울어진 직선이 된다", () => {
        const s: MinuteSeries = { index: new Map([[540, 0], [543, 1]]), close: [0, 9] };
        expect(memberPath(540, 543, s)).toEqual([
            { x: 540, y: 0 }, { x: 541, y: 0 }, { x: 542, y: 0 }, { x: 543, y: 9 },
        ]);
    });

    it("선두 갭(첫 값 이전)은 못 채운다 — 끌어올 직전 값이 없다", () => {
        const s: MinuteSeries = { index: new Map([[542, 0], [543, 1]]), close: [5, 9] };
        expect(memberPath(540, 543, s)!.map((p) => p.x)).toEqual([542, 543]);
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

describe("readingsAt — 핀한 시각의 테마 값", () => {
    const line = (code: string, pts: [number, number][]) => ({ code, name: `${code}이름`, points: pts.map(([x, y]) => ({ x, y })) });

    it("그 시각의 값을 큰 것부터 — y축을 위에서 아래로 읽는 순서와 같다", () => {
        const lines = [line("A", [[540, 1], [541, 3]]), line("B", [[540, 9], [541, 2]])];
        expect(readingsAt(lines, 540).map((r) => [r.code, r.y])).toEqual([["B", 9], ["A", 1]]);
    });

    it("그 시각에 값이 없는 종목은 뺀다 — 없는 걸 0으로 지어내지 않는다", () => {
        const lines = [line("A", [[540, 1]]), line("B", [[541, 9]])];
        expect(readingsAt(lines, 540).map((r) => r.code)).toEqual(["A"]);
    });
});

describe("layoutAxisColumns — 핀별 열 쌓기", () => {
    const g = (...ys: number[]) => ys.map((y, i) => ({ item: `i${y}_${i}`, y }));

    it("한 덩어리 안에서 y 가 멀면 같은 열(0)에 선다", () => {
        expect(layoutAxisColumns([g(0, 100, 200)], 10).map((s) => s.col)).toEqual([0, 0, 0]);
    });

    it("같은 세로 칸이면 옆 열로 밀린다 — 뱃지로 묶지 않는다(또 누르게 만들지 않으려고)", () => {
        expect(layoutAxisColumns([g(0, 1, 2)], 10).map((s) => s.col)).toEqual([0, 1, 2]);
    });

    it("판정은 격자가 아니라 **실거리** — 칸 경계를 사이에 둔 두 라벨(5·13, cellH 12)도 겹침으로 본다", () => {
        // 옛 반올림 방식은 5→칸0, 13→칸1 로 갈라 같은 열에서 8px 간격으로 겹쳤다(사용자가 본 겹침).
        expect(layoutAxisColumns([g(5, 13)], 12).map((s) => s.col)).toEqual([0, 1]);
        expect(layoutAxisColumns([g(5, 17)], 12).map((s) => s.col)).toEqual([0, 0]); // 12 이상 벌어지면 같은 열
    });

    it("옆 열로 밀린 뒤 더 아래 라벨은 첫 열로 돌아온다 — 열은 자리가 나는 대로 다시 쓴다", () => {
        expect(layoutAxisColumns([g(0, 5, 30)], 12).map((s) => s.col)).toEqual([0, 1, 0]);
    });

    it("다음 핀은 앞 핀이 쓴 열 **다음**에서 시작한다 — 시각이 열로 갈린다", () => {
        const out = layoutAxisColumns([g(0, 1), g(0, 1)], 10);
        expect(out.map((s) => s.col)).toEqual([0, 1, 2, 3]);
    });

    it("앞 핀이 한 열만 썼으면 다음 핀은 바로 옆 열", () => {
        expect(layoutAxisColumns([g(0), g(0), g(0)], 10).map((s) => s.col)).toEqual([0, 1, 2]);
    });

    it("빈 덩어리는 열을 안 먹는다", () => {
        expect(layoutAxisColumns([[], g(0)], 10).map((s) => s.col)).toEqual([0]);
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
        basePrice: 100, baseRate: 0, baseT: 0, points: [{ x: 0, y: 0 }, { x: 4, y: 10 }],
    };

    it("앵커와 테마가 겹치고 그 구간에 떴던 종목만 — 앵커 자신은 뺀다", () => {
        const stocks = [
            mk("A", ["반도체"], [0, 2, 5, 8, 10]),
            mk("B", ["반도체"], [0, 1, 3, 5, 6]), // 테마 겹침 + hot
            mk("C", ["바이오"], [0, 1, 2, 3, 4]), // 테마 다름
            mk("D", ["반도체"], [0, 1, 2, 3, 4]), // 테마 겹치나 hot 아님
        ];
        const lines = themeLines(anchor, stocks, new Set(["A", "B", "C"]), toMin, { from: 0, to: 4 });
        expect(lines.map((l) => l.code)).toEqual(["B"]);
        expect(lines[0].name).toBe("B이름");
    });

    it("구간은 호출측(화면 프레임)의 창, y 는 등락률 그대로 — %p 뷰로의 평행이동은 화면의 몫이다", () => {
        const stocks = [mk("A", ["T"], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 5, 5, 5, 20])];
        const [line] = themeLines(anchor, stocks, new Set(["B"]), toMin, { from: 0, to: 4 });
        expect(line.points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 20 }]);
    });

    it("창을 좁히면 테마 선도 그만큼만 — 미래 토글이 창을 넓히면 저절로 따라온다", () => {
        const stocks = [mk("A", ["T"], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 5, 6, 7, 20])];
        expect(themeLines(anchor, stocks, new Set(["B"]), toMin, { from: 1, to: 3 })[0].points.map((p) => p.x)).toEqual([1, 2, 3]);
    });

    it("앵커가 테마를 하나도 안 가지면 아무것도 안 그린다", () => {
        const stocks = [mk("A", [], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 1, 2, 3, 4])];
        expect(themeLines(anchor, stocks, new Set(["B"]), toMin, { from: 0, to: 4 })).toEqual([]);
    });

    it("앵커가 그날 유니버스 밖이면(스냅샷에 없음) 테마를 알 수 없다 — 빈 목록", () => {
        expect(themeLines(anchor, [mk("B", ["T"], [0, 1])], new Set(["B"]), toMin, { from: 0, to: 1 })).toEqual([]);
    });
});
