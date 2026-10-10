import { describe, it, expect } from "vitest";
import type { ReviewNote } from "@trade-data-manager/wire";
import { noteDatesOf, noteMonthsOf, rowsOn, unseenByDate, unseenOf } from "../reviewRows.js";

const n = (code: string, date: string, time: string, state: ReviewNote["state"] = null, id = `${date} ${time} ${code}`): ReviewNote =>
    ({ id, code, name: null, date, time, state, gam: null, candidate: null, hasMemo: false });

const notes = [
    n("009150", "2026-07-31", "09:05:00", "기록"),
    n("000660", "2026-07-31", "09:52:00"),
    n("000660", "2026-07-31", "09:02:00", "아님"),
    n("009150", "2026-07-30", "10:00:00"),
    n("009150", "2026-06-30", "10:00:00", "기록"),
];

describe("reviewRows", () => {
    it("날짜·달 — 오름차순 유일", () => {
        expect(noteDatesOf(notes)).toEqual(["2026-06-30", "2026-07-30", "2026-07-31"]);
        expect(noteMonthsOf(noteDatesOf(notes))).toEqual(["2026-06", "2026-07"]);
    });

    it("종목순 = 코드 → 시각 · 시간순 = 시각 → 코드", () => {
        expect(rowsOn(notes, "2026-07-31", "stock").map((r) => `${r.code} ${r.time}`)).toEqual(["000660 09:02:00", "000660 09:52:00", "009150 09:05:00"]);
        expect(rowsOn(notes, "2026-07-31", "time").map((r) => `${r.code} ${r.time}`)).toEqual(["000660 09:02:00", "009150 09:05:00", "000660 09:52:00"]);
    });

    it("같은 좌표 노트는 한 행으로 합친다(w/s 가 갇히지 않게)", () => {
        const dup = [...notes, n("009150", "2026-07-31", "09:05:00", null, "다른 파일")];
        const rows = rowsOn(dup, "2026-07-31", "stock");
        expect(rows).toHaveLength(3);
        expect(rows.find((r) => r.code === "009150")!.notes.map((x) => x.id)).toEqual(["2026-07-31 09:05:00 009150", "다른 파일"]);
    });

    it("빈 날 = 빈 행", () => {
        expect(rowsOn(notes, "2026-07-29", "stock")).toEqual([]);
    });

    it("안 본 노트 — 노트 단위 · 날짜별(노트 있는 날만 키)", () => {
        expect(unseenOf(notes)).toBe(2);
        expect([...unseenByDate(notes)]).toEqual([["2026-07-31", 1], ["2026-07-30", 1], ["2026-06-30", 0]]);
    });
});
