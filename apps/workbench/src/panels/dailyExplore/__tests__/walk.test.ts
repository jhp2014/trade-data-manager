// 날짜 걷기 순수부 — 옛 workset/rows.test 에서 탐색판이 쓰는 조각만 승계(2026-09-27 작업 대상 은퇴).
import { describe, it, expect } from "vitest";
import { stepFromMark, stepWithin } from "../walk.js";
import { nextDates, neighborDates } from "../dayCrossing.js";

const D = "2026-07-24";
const hm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;

describe("stepFromMark — 책갈피에서 한 칸, 책갈피 행이 사라지면 그 순번 자리에서", () => {
    const k = (m: number): { code: string; date: string; time: string } => ({ code: "A", date: D, time: hm(m) });
    const order = [k(540), k(541), k(542)];
    const mark = (m: number, idx: number): { key: ReturnType<typeof k>; idx: number; scope: string } => ({ key: k(m), idx, scope: D });

    it("목록에 있으면 이웃 · 끝이면 boundary", () => {
        expect(stepFromMark(order, mark(541, 1), 1)).toEqual({ kind: "move", to: order[2] });
        expect(stepFromMark(order, mark(541, 1), -1)).toEqual({ kind: "move", to: order[0] });
        expect(stepFromMark(order, mark(542, 2), 1)).toEqual({ kind: "boundary", dir: 1 });
    });

    it("사라졌으면 당겨진 칸이 다음, 그 앞이 이전 — 처음으로 튀지 않는다", () => {
        const gone = [k(540), k(542)]; // 541 이 빠졌다(idx 1)
        expect(stepFromMark(gone, mark(541, 1), 1)).toEqual({ kind: "move", to: gone[1] });
        expect(stepFromMark(gone, mark(541, 1), -1)).toEqual({ kind: "move", to: gone[0] });
        expect(stepFromMark([k(540)], mark(541, 1), 1), "마지막이 빠졌으면 끝").toEqual({ kind: "boundary", dir: 1 });
        expect(stepFromMark([], mark(541, 1), 1)).toBeNull();
    });

    it("앞 행까지 같이 빠져 순번이 길이를 넘으면 w = 마지막 칸(날짜를 넘기지 않는다) · s = 끝", () => {
        const few = [k(530), k(531)];
        expect(stepFromMark(few, mark(545, 5), -1)).toEqual({ kind: "move", to: few[1] });
        expect(stepFromMark(few, mark(545, 5), 1)).toEqual({ kind: "boundary", dir: 1 });
    });
});

describe("stepWithin — 끝에서는 경계를 알린다(날짜를 넘길지는 호출자가 정한다)", () => {
    const order = [{ code: "A", date: D, time: hm(545) }, { code: "A", date: D, time: hm(560) }];

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

    it("시각 없는 칸(머리줄 멈춤)은 커서 time null 과 맞는다 — undefined·null 을 같게 본다", () => {
        const withHead = [{ code: "B", date: D }, ...order];
        expect(stepWithin(withHead, { code: "B", date: D, time: null }, 1)).toEqual({ kind: "move", to: order[0] });
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
