import { describe, it, expect, vi } from "vitest";
import {
    memberPath, memberSegments, themeLines, hotMinutesInRange, codesHotWithin, dayResidencyOf, segmentAnchorAt,
    type MinuteSeries, type ThemeSourceStock,
} from "../themeSkeleton.js";

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

    it("**후미 갭(마지막 봉 이후)도 안 채운다** — 장이 끝난 뒤까지 평탄선이 뻗으면 없는 시간을 그린다", () => {
        const s: MinuteSeries = { index: new Map([[540, 0], [541, 1]]), close: [0, 5] };
        expect(memberPath(540, 600, s)!.map((p) => p.x)).toEqual([540, 541]);
    });

    it("점이 2개 미만이면 선이 아니다", () => {
        expect(memberPath(900, 910, seriesOf(540, [0, 1, 2]))).toBeNull();
        expect(memberPath(540, 540, seriesOf(540, [0, 1, 2]))).toBeNull();
    });
});

describe("hotMinutesInRange — 분 루프 한 번에서 종목별 재적 분을 뽑는다", () => {
    const stock = (code: string, rate: number[], amount: number[], themes: string[] = ["T"]): ThemeSourceStock => ({
        code, themes, name: code,
        times: rate.map((_, i) => i * 60), // 아래 toMin 이 분 = i 로 되돌린다
        rate, cumAmount: amount,
    });
    const toMin = (unix: number): number => unix / 60;
    // 거래대금 1위만 뽑는 가짜 판정 — 실제 selectHotUniverse 규칙은 core 테스트가 지킨다.
    const topAmount = (snaps: { code: string; amount: number; changeRate: number }[]): Set<string> =>
        new Set([[...snaps].sort((a, b) => b.amount - a.amount)[0].code]);

    it("종목별 재적 분 목록(오름차순) — 집합은 keys 로 공짜 파생", () => {
        const stocks = [stock("A", [1, 1, 1], [10, 10, 10]), stock("B", [1, 1, 1], [0, 99, 0])];
        const m = hotMinutesInRange(stocks, 0, 2, toMin, topAmount);
        expect(m.get("A")).toEqual([0, 2]);
        expect(m.get("B")).toEqual([1]);
    });

    it("판정은 **분당 한 번**만 돈다 — 집합과 재적 구간이 같은 루프에서 나온다(두 배 계산 회귀 방지)", () => {
        const stocks = [stock("A", [1, 1, 1], [10, 10, 10])];
        const spy = vi.fn(topAmount);
        hotMinutesInRange(stocks, 0, 2, toMin, spy);
        expect(spy).toHaveBeenCalledTimes(3); // 봉 있는 분 수만큼
    });

    it("스캔 범위는 데이터 범위로 좁혀진다 — 하루 전체(0..1439)를 달래도 봉 있는 분만 돈다", () => {
        const stocks = [stock("A", [1, 1, 1], [10, 10, 10])];
        const spy = vi.fn(topAmount);
        hotMinutesInRange(stocks, 0, 1439, toMin, spy);
        expect(spy).toHaveBeenCalledTimes(3);
    });
});

describe("codesHotWithin — 자격은 부분구간 교집합(넓은 스캔이 모집단을 넓히지 않는다)", () => {
    it("구간 전체의 **합집합** — 한 순간만 떴어도 든다", () => {
        const m = new Map([["A", [0, 2]], ["B", [1]]]);
        expect(codesHotWithin(m, 0, 2)).toEqual(new Set(["A", "B"]));
    });

    it("구간을 좁히면 그 순간의 것만 남는다 — 하루 전체를 스캔한 지도에서도 자격 창은 그대로다", () => {
        const m = new Map([["A", [0, 2]], ["B", [1]]]);
        expect(codesHotWithin(m, 0, 0)).toEqual(new Set(["A"]));
        expect(codesHotWithin(m, 5, 9)).toEqual(new Set());
    });
});

describe("memberSegments — 재적 구간만 긋는다(이탈 = 조각 끊김)", () => {
    it("이탈 → 조각 분절, 재진입 → 새 조각", () => {
        // 540~545 전부 봉 있음. 재적 540,541 / (542 봉 있는데 재적 아님 = 이탈) / 543,544 재진입.
        const s = seriesOf(540, [0, 1, 2, 3, 4, 5]);
        const segs = memberSegments(540, 545, s, [540, 541, 543, 544]);
        expect(segs.map((seg) => seg.map((p) => p.x))).toEqual([[540, 541], [543, 544]]);
    });

    it("**재적 밖은 안 메운다** — fillGaps 는 조각 안에서만 돈다(경계 분의 값이 이월되지 않는다)", () => {
        const s = seriesOf(540, [0, 1, 2, 3, 4, 5]);
        const segs = memberSegments(540, 545, s, [540, 543]);
        // 541·542 는 봉이 있는데 재적이 아니다 → 540 과 543 은 서로 다른 조각. 사이가 채워지면 이탈이 사실로 둔갑한다.
        expect(segs.map((seg) => seg.map((p) => p.x))).toEqual([[540], [543]]);
    });

    it("봉이 아예 없는 분은 **잇는다** — 모름 ≠ 이탈(얇은 종목이 1분 결손마다 부서지지 않게)", () => {
        // 542 에 봉 없음: 541 재적 → (542 결손) → 543 재적은 한 조각이고, 542 는 fillGaps 가 직전 종가로 채운다.
        const s: MinuteSeries = { index: new Map([[540, 0], [541, 1], [543, 2], [544, 3]]), close: [0, 1, 3, 4] };
        const segs = memberSegments(540, 545, s, [540, 541, 543, 544]);
        expect(segs).toEqual([[
            { x: 540, y: 0 }, { x: 541, y: 1 }, { x: 542, y: 1 }, { x: 543, y: 3 }, { x: 544, y: 4 },
        ]]);
    });

    it("1분 재적은 1점 조각으로 남는다 — 떴다는 사실이 보여야 한다(그리기는 점의 몫)", () => {
        const s = seriesOf(540, [0, 1, 2]);
        expect(memberSegments(540, 542, s, [541])).toEqual([[{ x: 541, y: 1 }]]);
    });

    it("그리는 구간 밖 재적은 잘린다", () => {
        const s = seriesOf(540, [0, 1, 2, 3, 4, 5]);
        expect(memberSegments(542, 543, s, [540, 541, 542, 543, 544]).map((seg) => seg.map((p) => p.x))).toEqual([[542, 543]]);
    });

    it("재적이 없으면 조각도 없다", () => {
        expect(memberSegments(540, 545, seriesOf(540, [0, 1]), [])).toEqual([]);
    });
});

describe("dayResidencyOf — 하루 전체 스캔의 캐시(스냅샷 배열 × N/M)", () => {
    const stocks: ThemeSourceStock[] = [{
        code: "A", themes: ["T"], name: "A",
        times: [0, 60, 120], rate: [1, 1, 1], cumAmount: [10, 20, 30],
    }];

    it("같은 배열·같은 N/M 이면 같은 지도(재계산 없음), N/M 이나 배열이 갈리면 새로 판다", () => {
        const a = dayResidencyOf(stocks, 1, 1);
        expect(dayResidencyOf(stocks, 1, 1)).toBe(a);
        expect(dayResidencyOf(stocks, 2, 1)).not.toBe(a);
        expect(dayResidencyOf([...stocks], 1, 1)).not.toBe(a); // 새 배열 = 새 스냅샷으로 간주
    });
});

describe("segmentAnchorAt — 거터 칩 자리(갭 위에 값을 지어내지 않는다)", () => {
    const segs = [
        [{ x: 0, y: 0 }, { x: 2, y: 2 }],
        [{ x: 5, y: 10 }, { x: 7, y: 20 }],
    ];

    it("우단을 덮는 조각에서 보간한다", () => {
        expect(segmentAnchorAt(segs, 6)).toEqual({ x: 6, y: 15 });
    });

    it("갭 위에서는 보간하지 않고 왼쪽 조각의 끝점으로 물러난다", () => {
        expect(segmentAnchorAt(segs, 3)).toEqual({ x: 2, y: 2 });
    });

    it("전부 오른쪽이면 첫 조각의 첫 점", () => {
        expect(segmentAnchorAt(segs, -1)).toEqual({ x: 0, y: 0 });
    });

    it("조각이 없으면 null — 지어내지 않는다", () => {
        expect(segmentAnchorAt([], 3)).toBeNull();
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
        // 하루 전체 모드 = 조각 1개(현행 그림 그대로).
        expect(line.segments).toEqual([[{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 20 }]]);
    });

    it("창을 좁히면 테마 선도 그만큼만 — 미래 토글이 창을 넓히면 저절로 따라온다", () => {
        const stocks = [mk("A", ["T"], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 5, 6, 7, 20])];
        expect(themeLines(anchor, stocks, new Set(["B"]), toMin, { from: 1, to: 3 })[0].segments[0].map((p) => p.x)).toEqual([1, 2, 3]);
    });

    it("재적 지도를 주면 조각으로 갈라 긋는다 — 모집단은 hotCodes 그대로(선을 어디까지 긋나만 바뀐다)", () => {
        const stocks = [mk("A", ["T"], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 5, 6, 7, 20])];
        const residency = new Map([["B", [0, 1, 3, 4]]]); // 2분(봉 있음)에 이탈
        const [line] = themeLines(anchor, stocks, new Set(["B"]), toMin, { from: 0, to: 4 }, residency);
        expect(line.segments.map((seg) => seg.map((p) => p.x))).toEqual([[0, 1], [3, 4]]);
    });

    it("재적 모드에서 재적이 전혀 없는 멤버는 탈락한다", () => {
        const stocks = [mk("A", ["T"], [0, 1, 2]), mk("B", ["T"], [0, 5, 6])];
        expect(themeLines(anchor, stocks, new Set(["B"]), toMin, { from: 0, to: 2 }, new Map())).toEqual([]);
    });

    it("앵커가 테마를 하나도 안 가지면 아무것도 안 그린다", () => {
        const stocks = [mk("A", [], [0, 1, 2, 3, 4]), mk("B", ["T"], [0, 1, 2, 3, 4])];
        expect(themeLines(anchor, stocks, new Set(["B"]), toMin, { from: 0, to: 4 })).toEqual([]);
    });

    it("앵커가 그날 유니버스 밖이면(스냅샷에 없음) 테마를 알 수 없다 — 빈 목록", () => {
        expect(themeLines(anchor, [mk("B", ["T"], [0, 1])], new Set(["B"]), toMin, { from: 0, to: 1 })).toEqual([]);
    });
});
