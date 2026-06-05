"use client";

import { useCallback, useMemo } from "react";
import { useReviewStore } from "@/stores/useReviewStore";
import type { ReviewStockGroup } from "@/types/review";

type TabPosition = { groupIndex: number; pointKey: string | null };

type UseTabNavigationParams = {
  /** 현재 읽기 소스: "sheet" = 시트 탭, "db" = DB 전체. */
  readSource: "sheet" | "db";
  /** 현재 읽기 시트 탭 이름. */
  readTab: string;
  /** 스프레드시트 탭 목록. */
  tabs: string[];
  /** 현재 쓰기 탭(없으면 null). */
  writeTab: string | null;
  /** 쓰기 탭 변경. */
  setWriteTab: (tab: string) => void;
  /** r키/탭 칩 순환 대상 제한(null = 전체). */
  cycleTabList: string[] | null;
  /** store 의 현재 그룹 인덱스(전환 전 위치 저장용). */
  storeGroupIndex: number;
  /** store 의 현재 타점 키(전환 전 위치 저장용). */
  storePointKey: string | null;
  /** 탭별 마지막 위치 맵("__db__" 키는 DB 모드). */
  tabPositions: Record<string, TabPosition>;
  /** 탭 위치 저장. */
  setTabPosition: (tab: string, pos: TabPosition) => void;
  /** 탭 전환(작업셋 캐시). */
  switchTab: (tab: string) => Promise<ReviewStockGroup[]>;
  /** DB 모드 전환(작업셋 캐시). */
  switchToDb: () => Promise<ReviewStockGroup[]>;
  /** 현재 탭 재조회. */
  reloadTab: (tab: string) => Promise<void>;
  /** 전체 캐시 무효화. */
  reloadAll: () => Promise<void>;
  /** RSC 새로고침(reloadAll 후). */
  refreshRouter: () => void;
};

export type UseTabNavigationResult = {
  /** 시트 탭 순환(DB 모드면 시트로 복귀). */
  handleCycleSheetTab: () => Promise<void>;
  /** DB ↔ 시트 토글. */
  handleToggleDbMode: () => Promise<void>;
  /** 쓰기 탭 순환. */
  handleCycleWriteTab: () => void;
  /** 현재 읽기 소스 재조회. */
  handleReloadTab: () => Promise<void>;
  /** 전체 캐시 무효화 + RSC 새로고침. */
  handleReloadAll: () => Promise<void>;
};

/** 새 그룹 목록 + 저장된 위치 → 복원할 선택값(인덱스/타점)으로 환산. */
function resolveRestore(newGroups: ReviewStockGroup[], savedPos?: TabPosition) {
  const newGroupIndex = Math.min(savedPos?.groupIndex ?? 0, Math.max(0, newGroups.length - 1));
  const newGroup = newGroups[newGroupIndex] ?? newGroups[0];
  const newPointKey = savedPos?.pointKey ?? newGroup?.points[0]?.pointKey ?? "";
  return { selectedGroupIndex: newGroupIndex, selectedPointKey: newPointKey };
}

/**
 * 읽기/쓰기 탭 전환·재조회 핸들러 묶음. 탭 전환 시 현재 위치(그룹/타점)를 저장하고
 * 대상 탭의 저장된 위치를 복원한다(시트/DB 공통 로직은 resolveRestore 로 단일화).
 */
export function useTabNavigation({
  readSource,
  readTab,
  tabs,
  writeTab,
  setWriteTab,
  cycleTabList,
  storeGroupIndex,
  storePointKey,
  tabPositions,
  setTabPosition,
  switchTab,
  switchToDb,
  reloadTab,
  reloadAll,
  refreshRouter,
}: UseTabNavigationParams): UseTabNavigationResult {
  // 전환 직전 현재 위치를 저장한다(시트/DB 공통).
  const saveCurrentPosition = useCallback(() => {
    const currentKey = readSource === "db" ? "__db__" : readTab;
    setTabPosition(currentKey, { groupIndex: storeGroupIndex, pointKey: storePointKey });
  }, [readSource, readTab, storeGroupIndex, storePointKey, setTabPosition]);

  // Read Tab 전환: 현재 위치를 저장하고 대상 탭의 저장된 위치를 복원한다.
  const handleSwitchReadTab = useCallback(
    async (newTab: string) => {
      if (newTab === readTab && readSource === "sheet") return;
      saveCurrentPosition();
      const newGroups = await switchTab(newTab);
      useReviewStore.getState().hydrateSelection(resolveRestore(newGroups, tabPositions[newTab]));
    },
    [readSource, readTab, saveCurrentPosition, switchTab, tabPositions],
  );

  // DB 모드 전환: 현재 위치를 저장하고 DB 저장 위치를 복원한다.
  const handleSwitchToDb = useCallback(async () => {
    saveCurrentPosition();
    const newGroups = await switchToDb();
    useReviewStore.getState().hydrateSelection(resolveRestore(newGroups, tabPositions["__db__"]));
  }, [saveCurrentPosition, switchToDb, tabPositions]);

  // cycleTabList 필터링: null = 전체, 배열 = 해당 탭만 순환.
  const effectiveCycleTabs = useMemo(
    () => (cycleTabList ? tabs.filter((t) => cycleTabList.includes(t)) : tabs),
    [tabs, cycleTabList],
  );

  // 시트 탭 순환: effectiveCycleTabs 안에서만 돌고 DB 모드 진입/탈출 안 함.
  // DB 모드에서 호출되면 마지막 시트 탭으로 복귀(r키/탭 칩 클릭).
  const handleCycleSheetTab = useCallback(async () => {
    const cycleTabs = effectiveCycleTabs.length > 0 ? effectiveCycleTabs : tabs;
    if (cycleTabs.length === 0) return;
    if (readSource === "db") {
      await handleSwitchReadTab(cycleTabs[0]);
    } else {
      if (cycleTabs.length <= 1) return;
      const idx = cycleTabs.indexOf(readTab);
      const nextIdx = (idx + 1) % cycleTabs.length;
      await handleSwitchReadTab(cycleTabs[nextIdx]);
    }
  }, [readSource, readTab, tabs, effectiveCycleTabs, handleSwitchReadTab]);

  // DB ↔ 시트 토글: 스위치 아이콘 전용.
  const handleToggleDbMode = useCallback(async () => {
    if (readSource === "db") {
      await handleSwitchReadTab(readTab);
    } else {
      await handleSwitchToDb();
    }
  }, [readSource, readTab, handleSwitchReadTab, handleSwitchToDb]);

  // Write Tab 순환: 탭 목록에서 다음 탭으로 전환한다(새 탭 생성은 설정에서).
  const handleCycleWriteTab = useCallback(() => {
    if (tabs.length === 0) return;
    const idx = writeTab ? tabs.indexOf(writeTab) : -1;
    const nextIdx = (idx + 1) % tabs.length;
    setWriteTab(tabs[nextIdx]);
  }, [tabs, writeTab, setWriteTab]);

  // 현재 읽기 소스 재조회 (DB 모드면 DB 재조회, 시트 모드면 현재 탭 재조회).
  const handleReloadTab = useCallback(async () => {
    if (readSource === "db") {
      await handleSwitchToDb();
    } else {
      await reloadTab(readTab);
    }
  }, [readSource, readTab, reloadTab, handleSwitchToDb]);

  // 전체 탭 캐시 무효화 + RSC 새로고침.
  const handleReloadAll = useCallback(async () => {
    await reloadAll();
    refreshRouter();
  }, [reloadAll, refreshRouter]);

  return {
    handleCycleSheetTab,
    handleToggleDbMode,
    handleCycleWriteTab,
    handleReloadTab,
    handleReloadAll,
  };
}
