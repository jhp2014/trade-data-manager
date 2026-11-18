import { describe, expect, it } from "vitest";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import { VertLines } from "./vertLine.js";

const chart = { timeScale: () => ({ timeToCoordinate: (t: number) => (t === 100 ? 42 : null) }) } as unknown as IChartApi;

describe("VertLines 시간축 라벨", () => {
    it("label 을 준 선만 시간축 라벨이 된다 — 선 색 바탕 · 흰 글씨 · 선 x", () => {
        const v = new VertLines([
            { time: 100 as UTCTimestamp, color: "#2563eb", label: "10:32" },
            { time: 100 as UTCTimestamp, color: "#000" },
        ]);
        v.attached({ chart, requestUpdate: () => {} });
        v.updateAllViews();
        const views = v.timeAxisViews();
        expect(views).toHaveLength(1);
        expect(views[0].text()).toBe("10:32");
        expect(views[0].coordinate()).toBe(42);
        expect(views[0].backColor()).toBe("#2563eb");
        expect(views[0].textColor()).toBe("#ffffff");
    });

    it("화면 밖(좌표 없음)이거나 차트에서 떨어지면 라벨 없음", () => {
        const v = new VertLines([{ time: 200 as UTCTimestamp, color: "#2563eb", label: "11:00" }]);
        v.attached({ chart, requestUpdate: () => {} });
        v.updateAllViews();
        expect(v.timeAxisViews()).toHaveLength(0);
        v.detached();
        v.updateAllViews();
        expect(v.timeAxisViews()).toHaveLength(0);
    });
});
