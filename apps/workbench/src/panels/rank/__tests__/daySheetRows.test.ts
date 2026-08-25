// day 행 모드의 순수 코어 — **타점 0인 후보 하루가 값 있는 행이 되는가**(grain 재편의 수용 기준).
import { describe, it, expect } from "vitest";
import { buildDaySheetRows, buildSheetRows } from "../rankSheet.js";
import { buildAxisIndex } from "../../../lib/rankIndex.js";
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { DayPresence } from "../../../lib/presence.js";

const DAY_AXIS = "c:supply-gap";
const POINT_AXIS = "c:daily-change-un";

/** day 축 줄 = 차트 행(시각 없음). */
const chartRow = (stockCode: string, date: string, orderKey: number): PlacedPoint => ({ stockCode, date, orderKey });
const pointRow = (stockCode: string, date: string, time: string, orderKey: number): PlacedPoint => ({ stockCode, date, time, orderKey });

const presence = (points: number, comment = false): DayPresence =>
    ({ stockCode: "", date: "", marks: new Map(), points, dayGroups: [], pointGroups: [], comment });

describe("buildDaySheetRows", () => {
    const indexByAxis = new Map([
        [DAY_AXIS, buildAxisIndex([chartRow("001", "2026-07-02", 7), chartRow("002", "2026-07-03", 3)])],
        [POINT_AXIS, buildAxisIndex([pointRow("001", "2026-07-02", "09:30:00", 5)])],
    ]);

    it("타점 0인 후보 하루도 day 축 값이 선다 — 기준선만 있으면 계산되는 세계의 행", () => {
        const rows = buildDaySheetRows(
            [{ stockCode: "002", date: "2026-07-03" }],
            [DAY_AXIS],
            indexByAxis,
            () => presence(0),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].time).toBeUndefined(); // 행 = 차트(하루)
        expect(rows[0].pointCount).toBe(0);
        expect(rows[0].cells[DAY_AXIS]?.orderKey).toBe(3); // 값 있음 — 미배치가 아니다
    });

    it("값 없는 후보 하루는 빈 셀로 남는다(행이 사라지지 않는다 — 진도 정보)", () => {
        const rows = buildDaySheetRows(
            [{ stockCode: "003", date: "2026-07-04" }],
            [DAY_AXIS],
            indexByAxis,
            () => presence(2, true),
        );
        expect(rows[0].cells[DAY_AXIS]).toBeNull();
        expect(rows[0].pointCount).toBe(2);
        expect(rows[0].comment).toBe(true);
    });

    it("point 행(타점 시트)은 day 축 셀을 차트 행에서 폴백으로 받는다 — 그날 전 타점이 같은 셀", () => {
        const rows = buildSheetRows(
            [{ stockCode: "001", date: "2026-07-02", time: "10:00:00" }, { stockCode: "001", date: "2026-07-02", time: "13:00:00" }],
            [DAY_AXIS, POINT_AXIS],
            indexByAxis,
        );
        expect(rows[0].cells[DAY_AXIS]?.orderKey).toBe(7);
        expect(rows[1].cells[DAY_AXIS]?.orderKey).toBe(7); // 시각이 달라도 같은 하루 = 같은 셀
        expect(rows[0].cells[POINT_AXIS]).toBeNull(); // point 축은 그 시각의 행만 — 폴백이 잘못 맞지 않는다
        expect(rows[1].cells[POINT_AXIS]).toBeNull();
    });
});
