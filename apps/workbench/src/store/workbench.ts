// 워크벤치 전역 스토어 — 도메인별 슬라이스 5개를 하나의 useWorkbench 로 조합(소비자는 슬라이스를 모름).
//  - focusSlice: Focus/Scope 연동버스(커서·렌즈·검색·활성타점) — 무효화규칙은 transitionFocus 단일 진실
//  - chartSlice: 줌·패널별 뷰(영속)·% 기준 시장·이동/줌 설정
//  - panelSlice: 패널 크롬(헤더 컨트롤 바 접힘, 영속) — 차트·보드 공용
//  - hypothesisSlice: 가설 선택 축·필터 draft(DNF)·패싯
//  - boardFilterSlice: 이슈/복기 배제 필터(영속, 편집 액션 팩토리 1벌)
//  - settingsSlice: 전역 설정(뉴스 엔진·보드·타점 프리셋)
// localStorage 영속은 persist.ts(loadJson/saveJson) 한 벌로 통일. 타입은 여기서 재노출(소비자 import 경로 유지).
import { create } from "zustand";
import { createFocusSlice, type FocusSlice } from "./focusSlice.js";
import { createLiveFocusSlice, type LiveFocusSlice } from "./liveFocusSlice.js";
import { createLiveChartSlice, type LiveChartSlice } from "./liveChartSlice.js";
import { createChartSlice, type ChartSlice } from "./chartSlice.js";
import { createPanelSlice, type PanelSlice } from "./panelSlice.js";
import { createHypothesisSlice, type HypothesisSlice } from "./hypothesisSlice.js";
import { createBoardFilterSlice, type BoardFilterSlice } from "./boardFilterSlice.js";
import { createSettingsSlice, type SettingsSlice } from "./settingsSlice.js";
import { createHistorySlice, type HistorySlice } from "./historySlice.js";

export type WorkbenchState = FocusSlice & LiveFocusSlice & LiveChartSlice & ChartSlice & PanelSlice & HypothesisSlice & BoardFilterSlice & SettingsSlice & HistorySlice;

export type { Focus, Scope, Search, ActivePoint, FocusSlice } from "./focusSlice.js";
export type { LiveFocus, LiveFocusSlice } from "./liveFocusSlice.js";
export type { LiveLineAnchor, LiveChartSlice } from "./liveChartSlice.js";
export type { ChartPriceMode, ChartView, ChartSettings, ChartSlice } from "./chartSlice.js";
export type { PanelSlice } from "./panelSlice.js";
export type { HypothesisSlice } from "./hypothesisSlice.js";
export type { BoardFilterActions, BoardFilterSlice } from "./boardFilterSlice.js";
export type { NewsSearchEngine, ThemeBoardSettings, ReplayBoardSettings, BoardMarket, BoardMarketMap, SettingsSlice } from "./settingsSlice.js";
export type { HistoryEntry, HistorySlice } from "./historySlice.js";

export const useWorkbench = create<WorkbenchState>()((...a) => ({
    ...createFocusSlice(...a),
    ...createLiveFocusSlice(...a),
    ...createLiveChartSlice(...a),
    ...createChartSlice(...a),
    ...createPanelSlice(...a),
    ...createHypothesisSlice(...a),
    ...createBoardFilterSlice(...a),
    ...createSettingsSlice(...a),
    ...createHistorySlice(...a),
}));
