// 차트 뷰 상태 슬라이스 — 줌(전역 f 토글)·패널별 뷰(영속)·% 기준 시장·이동/줌 설정.
import type { StateCreator } from "zustand";
import { loadJson, saveJson } from "./persist.js";
import type { WorkbenchState } from "./workbench.js";

export type ChartPriceMode = "krx" | "un"; // 분봉 등락률 기준 시장(UN=통합, KRX)
export type ChartView = "daily" | "minute" | "both"; // 차트 패널 뷰(일봉만/분봉만/둘다)

// 차트 이동·줌 설정 — a/d(±1봉)·shift+a/d(±jumpBars)·f(줌 토글). 봉 수는 사용자 조절.
export interface ChartSettings {
    jumpBars: number; // shift+a/d 이동 봉 수
    minuteZoomBars: number; // f 줌인 분봉 봉 수(현재 시각 중심)
    dailyZoomBars: number; // f 줌인 일봉 봉 수
    dailyZoomOutBars: number; // f 줌아웃 일봉 봉 수(~1년)
}

export interface ChartSlice {
    // f 줌(일봉+분봉 전역). anchor=줌 시작 시각 unix초(분봉 중심), null=미줌. 두 차트 패널이 함께 구독 → 같이 확대/축소.
    chartZoom: { anchor: number | null } | null;
    chartViews: Record<string, ChartView>; // 패널별 뷰(일봉만/분봉만/둘다). localStorage 영속 — 화면 전환에도 유지. 미저장 = 기본(chart-1 일봉·chart-2 분봉).
    chartPriceMode: ChartPriceMode; // 뷰 설정(축 아님) — 분봉 % 기준 시장
    chartSettings: ChartSettings;
    setChartPriceMode: (mode: ChartPriceMode) => void;
    setChartView: (panelId: string, view: ChartView) => void; // 패널별 일봉/분봉/둘다 (영속)
    toggleChartZoom: () => void; // f — 현재 시각 중심 확대 ↔ 축소(전역, 두 차트 동시)
    setChartSettings: (patch: Partial<ChartSettings>) => void;
}

// 차트 패널별 뷰 — localStorage 영속(그래프위치·프리셋 선례). 화면(프리셋) 전환으로 remount 돼도 유지.
const CHART_VIEWS_KEY = "wb.chartViews";

export const createChartSlice: StateCreator<WorkbenchState, [], [], ChartSlice> = (set) => ({
    chartZoom: null,
    chartViews: loadJson(CHART_VIEWS_KEY, (o) => (o && typeof o === "object" ? (o as Record<string, ChartView>) : null)) ?? {},
    chartPriceMode: "un",
    chartSettings: { jumpBars: 20, minuteZoomBars: 200, dailyZoomBars: 60, dailyZoomOutBars: 250 },

    setChartPriceMode: (mode) => set(() => ({ chartPriceMode: mode })),
    setChartView: (panelId, view) =>
        set((s) => {
            const next = { ...s.chartViews, [panelId]: view };
            saveJson(CHART_VIEWS_KEY, next);
            return { chartViews: next };
        }),
    // f 줌 토글 — 켤 때 현재 시각(focus.time)을 anchor(unix초)로 캡처. 시간 없으면 마지막 봉 기준(null).
    toggleChartZoom: () =>
        set((s) => ({ chartZoom: s.chartZoom ? null : { anchor: s.focus.time ? Math.floor(Date.parse(`${s.focus.date}T${s.focus.time}+09:00`) / 1000) : null } })),
    setChartSettings: (patch) => set((s) => ({ chartSettings: { ...s.chartSettings, ...patch } })),
});
