"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type PresetGroup, defaultPresetGroups } from "@/lib/quickPreset";

export type ChartPriceMode = "krx" | "nxt";

type UiState = {
  chartPriceMode: ChartPriceMode;
  setChartPriceMode: (mode: ChartPriceMode) => void;

  /** 헤더 종목명 아래 작게 노출할 필드 키(m_/feature). 선택 순서 유지. */
  headerFieldKeys: string[];
  toggleHeaderField: (key: string) => void;
  clearHeaderFields: () => void;

  /** Point List 카드에 노출할 m_ 필드 키. 선택 순서 유지. */
  pointFieldKeys: string[];
  togglePointField: (key: string) => void;
  clearPointFields: () => void;

  /**
   * m_ 값 필터. key(접두사 없는 원본 m_ 키) → 허용 값 목록.
   * 값이 1개 이상 선택된 키만 조건으로 적용한다(키 간 AND, 같은 키 값 간 OR).
   */
  manualFilters: Record<string, string[]>;
  toggleManualFilterValue: (key: string, value: string) => void;
  clearManualFilters: () => void;

  /** Write Sheet Tab 이름. null 이면 미설정(f 키 비활성). */
  writeTab: string | null;
  setWriteTab: (tab: string | null) => void;

  /**
   * f 키 append / Export 에서 출력할 필드 키(순서 포함).
   * m_xxx 는 "m_" 접두사 포함, feature 키는 그대로.
   * 기본값으로 stockCode/tradeDate/tradeTime 을 제공한다.
   */
  exportFieldKeys: string[];
  setExportFieldKeys: (keys: string[]) => void;

  /**
   * 탭별 탐색 위치(읽기 탭 전환 시 복원).
   * key = 탭명, value = { groupIndex, pointKey }.
   */
  tabPositions: Record<string, { groupIndex: number; pointKey: string | null }>;
  setTabPosition: (tab: string, pos: { groupIndex: number; pointKey: string | null }) => void;

  /**
   * r키·칩 클릭 탭 순환 대상. null = 전체 탭 순환.
   * 일부 탭만 순환하고 싶을 때 explicit list 로 지정.
   */
  cycleTabList: string[] | null;
  setCycleTabList: (list: string[] | null) => void;

  /**
   * 타점 입력창 컬럼 표시 순서 (m_ 접두사 포함).
   * 목록에 없는 키는 뒤에 붙는다.
   */
  inputKeyOrder: string[];
  setInputKeyOrder: (order: string[]) => void;

  /**
   * 타점 입력창에서 숨길 컬럼 (m_ 접두사 포함).
   * 숨겨진 컬럼: 신규 입력 시 빈값, 수정 시 기존 값 유지.
   */
  inputKeyDisabled: string[];
  setInputKeyDisabled: (disabled: string[]) => void;

  /**
   * 퀵 입력 프리셋 그룹(숫자키 1~4). 그룹>프리셋>항목 구조.
   * 정의 자체는 브라우저 localStorage 에만 저장(DB 무관).
   */
  quickPresetGroups: PresetGroup[];
  setQuickPresetGroups: (groups: PresetGroup[]) => void;
};

function toggleInList(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      chartPriceMode: "krx",
      setChartPriceMode: (mode) => set({ chartPriceMode: mode }),

      headerFieldKeys: [],
      toggleHeaderField: (key) =>
        set((state) => ({ headerFieldKeys: toggleInList(state.headerFieldKeys, key) })),
      clearHeaderFields: () => set({ headerFieldKeys: [] }),

      pointFieldKeys: [],
      togglePointField: (key) =>
        set((state) => ({ pointFieldKeys: toggleInList(state.pointFieldKeys, key) })),
      clearPointFields: () => set({ pointFieldKeys: [] }),

      manualFilters: {},
      toggleManualFilterValue: (key, value) =>
        set((state) => {
          const next = toggleInList(state.manualFilters[key] ?? [], value);
          const manualFilters = { ...state.manualFilters };
          if (next.length === 0) delete manualFilters[key];
          else manualFilters[key] = next;
          return { manualFilters };
        }),
      clearManualFilters: () => set({ manualFilters: {} }),

      writeTab: null,
      setWriteTab: (tab) => set({ writeTab: tab }),

      exportFieldKeys: ["stockCode", "tradeDate", "tradeTime"],
      setExportFieldKeys: (keys) => set({ exportFieldKeys: keys }),

      tabPositions: {},
      setTabPosition: (tab, pos) =>
        set((state) => ({ tabPositions: { ...state.tabPositions, [tab]: pos } })),

      cycleTabList: null,
      setCycleTabList: (list) => set({ cycleTabList: list }),

      inputKeyOrder: [],
      setInputKeyOrder: (order) => set({ inputKeyOrder: order }),

      inputKeyDisabled: [],
      setInputKeyDisabled: (disabled) => set({ inputKeyDisabled: disabled }),

      quickPresetGroups: defaultPresetGroups(),
      setQuickPresetGroups: (groups) => set({ quickPresetGroups: groups }),
    }),
    {
      name: "chart-review-ui",
      partialize: (state) => ({
        chartPriceMode: state.chartPriceMode,
        headerFieldKeys: state.headerFieldKeys,
        pointFieldKeys: state.pointFieldKeys,
        manualFilters: state.manualFilters,
        writeTab: state.writeTab,
        exportFieldKeys: state.exportFieldKeys,
        tabPositions: state.tabPositions,
        cycleTabList: state.cycleTabList,
        inputKeyOrder: state.inputKeyOrder,
        inputKeyDisabled: state.inputKeyDisabled,
        quickPresetGroups: state.quickPresetGroups,
      }),
    },
  ),
);
