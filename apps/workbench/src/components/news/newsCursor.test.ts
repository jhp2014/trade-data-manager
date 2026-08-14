import { describe, expect, it } from "vitest";
import { liveNextCursor, replayNextCursor, secondBefore } from "./newsCursor.js";

const item = (date: string, srno: string) => ({ date, srno });
const live = (date: string, time: string) => ({ date, time });

describe("replayNextCursor — 복기(DB) 커서 전진", () => {
    const PAGE = 3;

    it("마지막으로 받은 항목의 (date,srno)가 다음 커서", () => {
        const p1 = [item("2026-08-14", "9"), item("2026-08-14", "5"), item("2026-08-13", "8")];
        expect(replayNextCursor(p1, [p1], { date: "2026-08-14", dayInitial: false, pageSize: PAGE }))
            .toEqual({ date: "2026-08-13", srno: "8" });
    });

    it("일반 페이지가 limit 미만이면 과거 소진(undefined)", () => {
        const p1 = [item("2026-08-14", "9")];
        expect(replayNextCursor(p1, [p1], { date: "2026-08-14", dayInitial: false, pageSize: PAGE })).toBeUndefined();
    });

    it("'그 날 전체' 첫 페이지(dayInitial)는 짧아도 계속 — 과거는 남아있다", () => {
        const p1 = [item("2026-08-14", "9")];
        expect(replayNextCursor(p1, [p1], { date: "2026-08-14", dayInitial: true, pageSize: PAGE }))
            .toEqual({ date: "2026-08-14", srno: "9" });
    });

    it("마지막 페이지가 비어도 앞선 페이지의 꼬리에서 커서를 찾는다", () => {
        const p1 = [item("2026-08-14", "9"), item("2026-08-14", "5"), item("2026-08-14", "3")];
        const p2: ReturnType<typeof item>[] = [];
        expect(replayNextCursor(p2, [p1, p2], { date: "2026-08-14", dayInitial: true, pageSize: PAGE }))
            .toEqual({ date: "2026-08-14", srno: "3" });
    });

    it("전 페이지가 비었으면 (date, '0') — 그 날이 비었어도 과거로는 걸을 수 있다", () => {
        expect(replayNextCursor([], [[]], { date: "2026-08-14", dayInitial: true, pageSize: PAGE }))
            .toEqual({ date: "2026-08-14", srno: "0" });
    });
});

describe("liveNextCursor — 실시간(KIS) 앵커 되감기", () => {
    it("마지막 항목의 (date,time)이 다음 앵커", () => {
        const page = [live("2026-08-14", "10:30:00"), live("2026-08-14", "10:29:40")];
        expect(liveNextCursor(page, null)).toEqual(live("2026-08-14", "10:29:40"));
    });

    it("빈 페이지 = 과거 소진", () => {
        expect(liveNextCursor([], live("2026-08-14", "10:00:00"))).toBeUndefined();
    });

    it("앵커가 안 움직이면(한 페이지가 같은 초에 몰림) 1초 뒤로 강제 전진 — 무한 루프 방지", () => {
        const page = [live("2026-08-14", "10:30:00"), live("2026-08-14", "10:30:00")];
        expect(liveNextCursor(page, live("2026-08-14", "10:30:00"))).toEqual(live("2026-08-14", "10:29:59"));
    });
});

describe("secondBefore — 1초 되감기", () => {
    it("같은 날 안에서 1초", () => {
        expect(secondBefore(live("2026-08-14", "10:30:00"))).toEqual(live("2026-08-14", "10:29:59"));
        expect(secondBefore(live("2026-08-14", "10:00:00"))).toEqual(live("2026-08-14", "09:59:59"));
    });

    it("자정을 넘으면 전날 23:59:59 — 월·연 경계도 달력대로", () => {
        expect(secondBefore(live("2026-08-14", "00:00:00"))).toEqual(live("2026-08-13", "23:59:59"));
        expect(secondBefore(live("2026-08-01", "00:00:00"))).toEqual(live("2026-07-31", "23:59:59"));
        expect(secondBefore(live("2026-01-01", "00:00:00"))).toEqual(live("2025-12-31", "23:59:59"));
    });
});
