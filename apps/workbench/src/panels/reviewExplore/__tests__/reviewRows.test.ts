import { describe, it, expect } from "vitest";
import type { ReviewNote } from "@trade-data-manager/wire";
import { makeNameCompare, noteDatesOf, noteMonthsOf, rowsOn, unseenByDate, unseenOf } from "../reviewRows.js";

const NAMES: Record<string, string> = { "009150": "삼성전기", "000660": "SK하이닉스" };
/** id = 실제 vault 모양(`26년 07월/26.07.31 삼성전기 0905.md`). */
const idOf = (code: string, date: string, time: string): string =>
    `${date.slice(2, 4)}년 ${date.slice(5, 7)}월/${date.slice(2).replaceAll("-", ".")} ${NAMES[code]} ${time.slice(0, 5).replace(":", "")}.md`;
const ko = makeNameCompare("ko");
const n = (code: string, date: string, time: string, state: ReviewNote["state"] = null, id = idOf(code, date, time)): ReviewNote =>
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

    it("종목순 = 노트 이름순(Obsidian 과 같은 — 종목명 → 시각, ko 는 한글 먼저) · 시간순 = 시각 → 이름", () => {
        expect(rowsOn(notes, "2026-07-31", "stock", ko).map((r) => `${r.code} ${r.time}`)).toEqual(["009150 09:05:00", "000660 09:02:00", "000660 09:52:00"]);
        expect(rowsOn(notes, "2026-07-31", "time", ko).map((r) => `${r.code} ${r.time}`)).toEqual(["000660 09:02:00", "009150 09:05:00", "000660 09:52:00"]);
    });

    it("이름 대조 — 숫자 인식·대소문자 무시(SK스퀘어 < sk하이닉스, 2 < 10)", () => {
        expect(["sk하이닉스", "SK스퀘어", "10x", "2x"].sort(ko)).toEqual(["2x", "10x", "SK스퀘어", "sk하이닉스"]);
    });

    it("같은 좌표 노트는 한 행으로 합친다(w/s 가 갇히지 않게)", () => {
        const dup = [...notes, n("009150", "2026-07-31", "09:05:00", null, "26년 07월/26.07.31 삼성전기 0905 사본.md")];
        const rows = rowsOn(dup, "2026-07-31", "stock", ko);
        expect(rows).toHaveLength(3);
        expect(rows.find((r) => r.code === "009150")!.notes.map((x) => x.id)).toEqual(["26년 07월/26.07.31 삼성전기 0905.md", "26년 07월/26.07.31 삼성전기 0905 사본.md"]);
    });

    it("빈 날 = 빈 행", () => {
        expect(rowsOn(notes, "2026-07-29", "stock")).toEqual([]);
    });

    it("안 본 노트 — 노트 단위 · 날짜별(노트 있는 날만 키)", () => {
        expect(unseenOf(notes)).toBe(2);
        expect([...unseenByDate(notes)]).toEqual([["2026-07-31", 1], ["2026-07-30", 1], ["2026-06-30", 0]]);
    });
});
