import { describe, expect, it } from "vitest";
import { htsNextCursor } from "./htsFeed.js";

const item = (date: string, srno: string) => ({ date, srno });

describe("htsNextCursor — (date, srno) 커서 전진", () => {
    const PAGE = 3;

    it("마지막으로 받은 항목의 (date, srno)가 다음 커서", () => {
        const p1 = [item("2026-08-14", "9"), item("2026-08-14", "5"), item("2026-08-13", "8")];
        expect(htsNextCursor(p1, [p1], { date: "2026-08-14", dayInitial: false, pageSize: PAGE })).toEqual({ date: "2026-08-13", srno: "8" });
    });

    it("일반 장이 limit 미만이면 과거 소진(undefined)", () => {
        const p1 = [item("2026-08-14", "9")];
        expect(htsNextCursor(p1, [p1], { date: "2026-08-14", dayInitial: false, pageSize: PAGE })).toBeUndefined();
    });

    it("'그 날 전체' 첫 장(dayInitial)은 짧아도 계속 — 과거는 남아 있다", () => {
        const p1 = [item("2026-08-14", "9")];
        expect(htsNextCursor(p1, [p1], { date: "2026-08-14", dayInitial: true, pageSize: PAGE })).toEqual({ date: "2026-08-14", srno: "9" });
    });

    it("마지막 장이 비어도 앞선 장의 꼬리에서 커서를 찾는다", () => {
        const p1 = [item("2026-08-14", "9"), item("2026-08-14", "5"), item("2026-08-14", "3")];
        expect(htsNextCursor([], [p1, []], { date: "2026-08-14", dayInitial: true, pageSize: PAGE })).toEqual({ date: "2026-08-14", srno: "3" });
    });

    it("받은 장이 전부 비었으면 (date, '0') — 그 날이 비었어도 과거로는 걸을 수 있다", () => {
        expect(htsNextCursor([], [[]], { date: "2026-08-14", dayInitial: true, pageSize: PAGE })).toEqual({ date: "2026-08-14", srno: "0" });
    });
});
