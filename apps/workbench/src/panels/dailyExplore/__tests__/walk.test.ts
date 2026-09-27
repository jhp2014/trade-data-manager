// 날짜 걷기 순수부 — 옛 workset/rows.test 에서 탐색판이 쓰는 조각만 승계(2026-09-27 작업 대상 은퇴).
import { describe, it, expect } from "vitest";
import { stepWithin } from "../walk.js";
import { nextDates, neighborDates } from "../dayCrossing.js";

const D = "2026-07-24";
const hm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;

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
