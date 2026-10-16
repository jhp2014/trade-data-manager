// 차트 설정 — 시각 이동 폭(shift+a/d)과 f 줌 봉 수(저장). f 줌 켜짐은 세션 값. workbench store/chartSlice.ts 의 chartSettings·chartZoom.
// 값은 범위로 잘라 넣는다(설정 창 입력이 범위를 넘어도 저장값은 늘 범위 안).
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface ChartSettings {
    /** shift+a/d 한 번에 옮기는 분봉 수. */
    jumpBars: number;
    /** f 줌 — 분봉을 시각 선 가운데로 이만큼 보인다. */
    minuteZoomBars: number;
    /** f 줌 — 일봉을 경로 날짜까지 이만큼 보인다. */
    dailyZoomBars: number;
    /** 줌 해제(기본) — 일봉을 경로 날짜까지 이만큼 보인다. */
    dailyZoomOutBars: number;
}

export const CHART_SETTING_RANGES: Record<keyof ChartSettings, { min: number; max: number }> = {
    jumpBars: { min: 1, max: 240 },
    minuteZoomBars: { min: 10, max: 1000 },
    dailyZoomBars: { min: 5, max: 500 },
    dailyZoomOutBars: { min: 20, max: 1000 },
};

export const DEFAULT_CHART_SETTINGS: ChartSettings = { jumpBars: 20, minuteZoomBars: 200, dailyZoomBars: 60, dailyZoomOutBars: 250 };

const clampSetting = (k: keyof ChartSettings, v: number): number => {
    const r = CHART_SETTING_RANGES[k];
    return Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, Math.round(v))) : DEFAULT_CHART_SETTINGS[k];
};

interface ChartSettingsState {
    settings: ChartSettings;
    set: (patch: Partial<ChartSettings>) => void;
    /** f 줌 — 모든 차트 패널이 같이 줌인/해제한다. 세션 값. */
    zoom: boolean;
    toggleZoom: () => void;
}

export const useChartSettings = create<ChartSettingsState>()(
    persist(
        (set) => ({
            settings: DEFAULT_CHART_SETTINGS,
            set: (patch) =>
                set((st) => {
                    const next = { ...st.settings };
                    for (const k of Object.keys(patch) as (keyof ChartSettings)[]) next[k] = clampSetting(k, patch[k]!);
                    return { settings: next };
                }),
            zoom: false,
            toggleZoom: () => set((st) => ({ zoom: !st.zoom })),
        }),
        {
            name: "trade-lab.chart-settings",
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ settings: st.settings }),
            // 저장본의 값도 범위로 — 손으로 고친 저장본·옛 항목이 섞여도 늘 온전한 설정.
            merge: (persisted, current) => {
                const saved = (persisted as { settings?: Partial<Record<keyof ChartSettings, unknown>> } | undefined)?.settings ?? {};
                const settings = { ...DEFAULT_CHART_SETTINGS };
                for (const k of Object.keys(DEFAULT_CHART_SETTINGS) as (keyof ChartSettings)[]) {
                    if (typeof saved[k] === "number") settings[k] = clampSetting(k, saved[k] as number);
                }
                return { ...current, settings };
            },
        },
    ),
);
