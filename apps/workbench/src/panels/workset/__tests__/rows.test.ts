import { describe, it, expect } from "vitest";
import { dayRows, longitudinalRows, navKeyOf, stepWithin, walkableOf, type DayCell } from "../rows.js";
import { nextDates, neighborDates } from "../dayCrossing.js";
import type { DayPresence } from "../../../lib/presence.js";

const D = "2026-07-24";
const hm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
const cell = (code: string, min: number, over: Partial<DayCell> = {}): DayCell => ({
    code,
    min,
    time: hm(min),
    hit: { code, min, tags: ["c"], ratePct: 1, cumAmount: 1, zoneRank: null, zoneTheme: null, breakout: null },
    labeled: false,
    ...over,
});

const NONE = new Set<string>();

describe("dayRows — 종목순(섹션) / 시간순(평탄)", () => {
    const cells = [cell("B", 570), cell("A", 545), cell("A", 560)];

    it("종목순은 종목 머리 + 자식, 코드↑ · 분↑", () => {
        const rows = dayRows(cells, D, { sort: "stock", collapsed: NONE });
        expect(rows.map((r) => r.kind)).toEqual(["dayStock", "dayCell", "dayCell", "dayStock", "dayCell"]);
        expect(rows.flatMap((r) => (r.kind === "dayCell" ? [`${r.cell.code}@${r.cell.min}`] : []))).toEqual(["A@545", "A@560", "B@570"]);
    });

    it("시간순은 머리 없이 평탄 — 정렬 토글이 곧 섹션 유무다", () => {
        const rows = dayRows(cells, D, { sort: "time", collapsed: NONE });
        expect(rows.every((r) => r.kind === "dayCell")).toBe(true);
        expect(rows.flatMap((r) => (r.kind === "dayCell" ? [r.cell.min] : []))).toEqual([545, 560, 570]);
    });

    it("접힌 종목은 **자식 행을 안 만든다** — 그래서 순회에서도 자동으로 빠진다", () => {
        const rows = dayRows(cells, D, { sort: "stock", collapsed: new Set(["A"]) });
        expect(rows.map((r) => r.kind)).toEqual(["dayStock", "dayStock", "dayCell"]);
        expect(walkableOf(rows).map(navKeyOf)).toEqual([`B|${D}|09:30:00`]);
    });

    it("머리는 ◇·◆ 수를 따로 센다(겹치는 좌표는 양쪽에 든다)", () => {
        const rows = dayRows(
            [cell("A", 545), cell("A", 560, { labeled: true }), cell("A", 570, { labeled: true, hit: null })],
            D,
            { sort: "stock", collapsed: NONE },
        );
        const head = rows[0]!;
        expect(head.kind === "dayStock" && head.hits).toBe(2);
        expect(head.kind === "dayStock" && head.labels).toBe(2);
    });
});

describe("walkableOf — 머리는 안 밟는다", () => {
    it("좌표 행만 순회 대상이다", () => {
        const rows = dayRows([cell("A", 545), cell("B", 560)], D, { sort: "stock", collapsed: NONE });
        expect(rows.filter((r) => r.kind === "dayStock")).toHaveLength(2);
        expect(walkableOf(rows)).toHaveLength(2);
    });

    it("종단 행도 같은 규칙 — 타점만 밟고 날짜·종목 머리는 건너뛴다", () => {
        const presence = {} as DayPresence;
        const rows = longitudinalRows([{ date: D, stocks: [{ date: D, code: "A", presence, points: [{ stockCode: "A", date: D, time: "09:05:00" }] }] }]);
        expect(rows.map((r) => r.kind)).toEqual(["date", "stock", "point"]);
        expect(walkableOf(rows)).toEqual([{ code: "A", date: D, time: "09:05:00" }]);
    });
});

describe("stepWithin — 끝에서는 경계를 알린다(날짜를 넘길지는 호출자가 정한다)", () => {
    const order = walkableOf(dayRows([cell("A", 545), cell("A", 560)], D, { sort: "stock", collapsed: NONE }));

    it("커서가 없으면 방향의 첫 항목으로 들어간다", () => {
        expect(stepWithin(order, null, 1)).toEqual({ kind: "move", to: order[0] });
        expect(stepWithin(order, null, -1)).toEqual({ kind: "move", to: order[1] });
    });

    it("가운데서는 한 칸 움직인다", () => {
        expect(stepWithin(order, { code: "A", date: D, time: hm(545) }, 1)).toEqual({ kind: "move", to: order[1] });
    });

    it("끝에서는 boundary — 목록 밖으로 나가지 않는다", () => {
        expect(stepWithin(order, { code: "A", date: D, time: hm(560) }, 1)).toEqual({ kind: "boundary", dir: 1 });
        expect(stepWithin(order, { code: "A", date: D, time: hm(545) }, -1)).toEqual({ kind: "boundary", dir: -1 });
    });

    it("빈 목록은 아무 일도 안 한다", () => {
        expect(stepWithin([], null, 1)).toBeNull();
    });
});

describe("nextDates — 거래일 목록 위의 방향 이동", () => {
    const dates = ["2026-07-22", "2026-07-23", "2026-07-24", "2026-07-27"];

    it("방향대로 최대 max 개", () => {
        expect(nextDates(dates, "2026-07-23", 1, 2)).toEqual(["2026-07-24", "2026-07-27"]);
        expect(nextDates(dates, "2026-07-24", -1, 2)).toEqual(["2026-07-23", "2026-07-22"]);
    });

    it("끝에서는 빈 배열(넘길 곳이 없다)", () => {
        expect(nextDates(dates, "2026-07-27", 1, 3)).toEqual([]);
    });

    it("목록 밖 날짜(데이터 없는 날)에서도 가장 가까운 쪽으로 간다", () => {
        expect(nextDates(dates, "2026-07-25", 1, 1)).toEqual(["2026-07-27"]);
        expect(nextDates(dates, "2026-07-25", -1, 1)).toEqual(["2026-07-24"]);
    });

    it("이웃(프리페치 대상)은 앞뒤 하나씩", () => {
        expect(neighborDates(dates, "2026-07-23")).toEqual(["2026-07-22", "2026-07-24"]);
    });
});
