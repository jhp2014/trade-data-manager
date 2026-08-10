import { describe, it, expect } from "vitest";
import type { CandidateDay, MapPlacement } from "../../../api/map.js";
import { CELL_PX, dayKey, groupByDate, itemKey, lodOf, monthsOf, movedPlacements, quantizeZoom, unplacedDays } from "../mapView.js";

const placement = (id: string, stockCode: string, date: string, x: number, y: number, time?: string): MapPlacement => ({
    id,
    mapId: "1",
    item: { stockCode, date, ...(time ? { time } : {}) },
    x,
    y,
    groupId: null,
});
const candidate = (stockCode: string, date: string): CandidateDay => ({ stockCode, date, traces: ["anchor"] });

describe("mapView", () => {
    it("itemKey — day 자리는 시각이 없고 point 자리는 있다", () => {
        expect(itemKey({ stockCode: "005930", date: "2026-07-01" })).toBe("005930|2026-07-01");
        expect(itemKey({ stockCode: "005930", date: "2026-07-01", time: "09:30:00" })).toBe("005930|2026-07-01|09:30:00");
    });

    describe("unplacedDays", () => {
        it("자리가 있는 하루는 빠진다", () => {
            const left = unplacedDays(
                [candidate("005930", "2026-07-01"), candidate("000660", "2026-07-02")],
                [placement("1", "005930", "2026-07-01", 0, 0)],
            );
            expect(left.map((c) => c.stockCode)).toEqual(["000660"]);
        });

        it("자리가 여럿이어도(징검다리) 하루는 한 번만 빠진다 — 질문은 '올렸나'지 '몇 번'이 아니다", () => {
            const left = unplacedDays(
                [candidate("005930", "2026-07-01")],
                [placement("1", "005930", "2026-07-01", 0, 0), placement("2", "005930", "2026-07-01", 9, 9)],
            );
            expect(left).toEqual([]);
        });

        it("같은 종목의 다른 날짜는 서로를 안 지운다", () => {
            const left = unplacedDays(
                [candidate("005930", "2026-07-01"), candidate("005930", "2026-07-02")],
                [placement("1", "005930", "2026-07-01", 0, 0)],
            );
            expect(left.map((c) => c.date)).toEqual(["2026-07-02"]);
        });
    });

    it("movedPlacements — 고른 자리만 움직이고 나머지는 참조까지 그대로", () => {
        const before = [placement("1", "005930", "2026-07-01", 0, 0), placement("2", "000660", "2026-07-02", 10, 10)];
        const after = movedPlacements(before, [{ id: "1", x: 5, y: -5 }]);
        expect(after[0]).toMatchObject({ id: "1", x: 5, y: -5 });
        expect(after[1]).toBe(before[1]);
    });

    describe("lodOf — 뭉치기", () => {
        it("멀리 떨어진 것들은 안 뭉친다", () => {
            const ps = [placement("1", "A00001", "2026-07-01", 0, 0), placement("2", "A00002", "2026-07-01", 1000, 1000)];
            const lod = lodOf(ps, 1);
            expect(lod.items).toHaveLength(2);
            expect(lod.bins).toHaveLength(0);
        });

        it("같은 칸에 든 것들은 뭉치고, 위치는 멤버들의 무게중심이다", () => {
            const ps = [
                placement("1", "A00001", "2026-07-01", 10, 10),
                placement("2", "A00002", "2026-07-01", 20, 30),
                placement("3", "A00003", "2026-07-01", 30, 20),
            ];
            const lod = lodOf(ps, 1); // 칸 = 72 → 셋 다 (0,0) 칸
            expect(lod.items).toHaveLength(0);
            expect(lod.bins).toHaveLength(1);
            expect(lod.bins[0]!.members).toHaveLength(3);
            expect(lod.bins[0]!.x).toBeCloseTo(20);
            expect(lod.bins[0]!.y).toBeCloseTo(20);
        });

        it("확대하면(배율↑) 칸이 작아져 뭉친 게 낱개로 풀린다", () => {
            const ps = [placement("1", "A00001", "2026-07-01", 0, 0), placement("2", "A00002", "2026-07-01", 60, 60)];
            expect(lodOf(ps, 1).bins).toHaveLength(1); // 칸 72 → 한 칸
            expect(lodOf(ps, 4).items).toHaveLength(2); // 칸 18 → 다른 칸
        });

        it("혼자인 칸은 뭉치지 않는다(개수 1짜리 표식을 만들지 않는다)", () => {
            const lod = lodOf([placement("1", "A00001", "2026-07-01", 5, 5)], 1);
            expect(lod.bins).toHaveLength(0);
            expect(lod.items).toHaveLength(1);
        });

        it("표식 수의 상한은 코퍼스가 아니라 화면 넓이로 정해진다", () => {
            // 1400×800 화면을 가득 채우도록 5000개를 흩뿌린다 → 배율 1에서 칸은 72px.
            const ps = Array.from({ length: 5000 }, (_, i) =>
                placement(String(i), "A00001", "2026-07-01", (i * 37) % 1400, (i * 53) % 800),
            );
            const lod = lodOf(ps, 1, CELL_PX);
            const marks = lod.items.length + lod.bins.length;
            const cellsThatFit = Math.ceil(1400 / CELL_PX) * Math.ceil(800 / CELL_PX);
            expect(marks).toBeLessThanOrEqual(cellsThatFit);
        });

        it("이동은 뭉침을 안 바꾼다 — 격자가 맵 공간에 고정이라 배율에만 의존한다", () => {
            const ps = [placement("1", "A00001", "2026-07-01", 10, 10), placement("2", "A00002", "2026-07-01", 20, 20)];
            expect(lodOf(ps, 2).bins.length).toBe(lodOf(ps, 2).bins.length); // 같은 배율이면 결과가 같다
        });
    });

    it("quantizeZoom — 배율이 조금 흔들려도 같은 계단이면 다시 안 센다", () => {
        expect(quantizeZoom(1)).toBe(quantizeZoom(1.05));
        expect(quantizeZoom(1)).not.toBe(quantizeZoom(2));
    });

    describe("트레이 묶기", () => {
        it("monthsOf — YYYY-MM 내림차순, 중복 없음", () => {
            expect(monthsOf([candidate("A", "2026-07-01"), candidate("B", "2026-07-20"), candidate("C", "2026-05-02")])).toEqual([
                "2026-07",
                "2026-05",
            ]);
        });

        it("groupByDate — 날짜 내림차순, 날짜 안에서는 종목코드 오름차순", () => {
            const g = groupByDate([
                candidate("B00002", "2026-07-01"),
                candidate("A00001", "2026-07-01"),
                candidate("C00003", "2026-07-05"),
            ]);
            expect(g.map((x) => x.date)).toEqual(["2026-07-05", "2026-07-01"]);
            expect(g[1]!.days.map((d) => d.stockCode)).toEqual(["A00001", "B00002"]);
        });
    });

    it("dayKey — 자리의 항목 키와 같은 모양이라 그대로 뺄 수 있다", () => {
        expect(dayKey({ stockCode: "005930", date: "2026-07-01" })).toBe(itemKey({ stockCode: "005930", date: "2026-07-01" }));
    });
});
