import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CHART_SETTINGS, useChartSettings } from "./chartSettings.js";

const st = () => useChartSettings.getState();

beforeEach(() => {
    localStorage.clear();
    useChartSettings.setState(useChartSettings.getInitialState(), true);
});

describe("차트 설정", () => {
    it("값은 범위로 자르고 반올림한다 — 숫자가 아니면 기본값", () => {
        st().set({ jumpBars: 0 });
        expect(st().settings.jumpBars).toBe(1);
        st().set({ minuteZoomBars: 99999, dailyZoomBars: 30.6 });
        expect(st().settings).toMatchObject({ minuteZoomBars: 1000, dailyZoomBars: 31 });
        st().set({ jumpBars: Number.NaN });
        expect(st().settings.jumpBars).toBe(DEFAULT_CHART_SETTINGS.jumpBars);
    });

    it("저장본의 값도 범위로 — 모르는 항목·숫자 아닌 값은 버린다", async () => {
        localStorage.setItem("trade-lab.chart-settings", JSON.stringify({ state: { settings: { jumpBars: 5000, minuteZoomBars: "x", junk: 1 } }, version: 1 }));
        await useChartSettings.persist.rehydrate();
        expect(st().settings).toEqual({ ...DEFAULT_CHART_SETTINGS, jumpBars: 240 });
    });

    it("f 줌은 토글이고 저장하지 않는다", () => {
        st().toggleZoom();
        expect(st().zoom).toBe(true);
        expect(localStorage.getItem("trade-lab.chart-settings")).not.toContain("zoom");
    });
});
