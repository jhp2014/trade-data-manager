"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewStockGroup } from "@/types/review";
import type { UpsertPointInput } from "@/lib/optimisticPoint";
import { getJson, getJsonOrNull } from "@/lib/apiClient";
import { useOptimisticGroups } from "@/hooks/useOptimisticGroups";

type WorksetResponse = { groups?: ReviewStockGroup[] };
type TabsResponse = { tabs?: string[] };

type WorksetCache = Map<string, ReviewStockGroup[]>;

export type UseWorkingSetCacheResult = {
  /** 스프레드시트의 탭 목록. */
  tabs: string[];
  /** 현재 읽기 탭 이름. */
  readTab: string;
  /** 현재 작업셋 그룹. */
  groups: ReviewStockGroup[];
  /** true 면 전환 중 (초기 탭은 즉시 표시). */
  isLoadingWorkset: boolean;
  /** 현재 읽기 소스: "sheet" = 시트 탭, "db" = DB 전체. */
  readSource: "sheet" | "db";
  /** 탭 전환. 캐시에 있으면 즉시, 없으면 fetch 후 전환. 새 groups 를 반환한다. */
  switchTab: (tab: string) => Promise<ReviewStockGroup[]>;
  /** DB 전체 모드로 전환. */
  switchToDb: () => Promise<ReviewStockGroup[]>;
  /** 해당 탭 캐시를 무효화하고 재조회. */
  reloadTab: (tab: string) => Promise<void>;
  /** 탭 목록을 재조회하고 전체 캐시를 무효화. */
  reloadAll: () => Promise<void>;
  /** 타점 1건 저장 후 서버 재조회 없이 현재 groups·캐시를 즉시 갱신(낙관적). */
  upsertPointLocal: (input: UpsertPointInput) => void;
  /** 타점 1건 삭제 후 서버 재조회 없이 현재 groups·캐시를 즉시 갱신(낙관적). */
  removePointLocal: (reviewId: string) => void;
  /** m_ 키 삭제 후 모든 타점 manual 에서 해당 키를 제거(낙관적). */
  purgeManualKeyLocal: (key: string) => void;
  /** m_ 키 이름변경 후 모든 타점 manual 키를 from→to 로 이동(낙관적). */
  renameManualKeyLocal: (from: string, to: string) => void;
};

/**
 * Sheet Tab 별 작업셋을 클라이언트 메모리에 캐시한다.
 * - 초기 탭 데이터는 RSC 에서 받아 즉시 사용(요청 0).
 * - 마운트 시 탭 목록을 조회하고, 다른 탭을 background 에서 eager preload.
 * - switchTab 은 캐시에 있으면 즉시 반환, 없으면 fetch.
 */
export function useWorkingSetCache(
  initialGroups: ReviewStockGroup[],
  initialTab: string,
  initialReadSource: "sheet" | "db" = "sheet",
): UseWorkingSetCacheResult {
  const cacheRef = useRef<WorksetCache>(new Map([[initialTab, initialGroups]]));
  const [tabs, setTabs] = useState<string[]>([initialTab]);
  const [readTab, setReadTab] = useState(initialTab);
  const [groups, setGroups] = useState(initialGroups);
  const [isLoadingWorkset, setIsLoadingWorkset] = useState(false);
  const [readSource, setReadSource] = useState<"sheet" | "db">(initialReadSource);

  // 마운트 시 탭 목록 조회 + 다른 탭 eager preload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tabsRes = await getJsonOrNull<TabsResponse>("/api/review/sheets/tabs");
      if (cancelled || !tabsRes?.tabs?.length) return;
      const allTabs = tabsRes.tabs;
      setTabs(allTabs);
      // 현재 탭 제외하고 background preload. 실패해도 이후 switchTab 때 재시도하므로 무시.
      for (const tab of allTabs) {
        if (cancelled) break;
        if (cacheRef.current.has(tab)) continue;
        const wr = await getJsonOrNull<WorksetResponse>(
          `/api/review/workset?tab=${encodeURIComponent(tab)}`,
        );
        if (cancelled) break;
        if (wr?.groups) cacheRef.current.set(tab, wr.groups);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchWorkset = useCallback(async (tab: string): Promise<ReviewStockGroup[]> => {
    const json = await getJson<WorksetResponse>(
      `/api/review/workset?tab=${encodeURIComponent(tab)}`,
      "workset fetch failed",
    );
    if (!json.groups) throw new Error("workset fetch failed");
    cacheRef.current.set(tab, json.groups);
    return json.groups;
  }, []);

  const switchTab = useCallback(
    async (tab: string): Promise<ReviewStockGroup[]> => {
      const cached = cacheRef.current.get(tab);
      if (cached && cached.length > 0) {
        setReadTab(tab);
        setGroups(cached);
        setReadSource("sheet");
        return cached;
      }
      setIsLoadingWorkset(true);
      try {
        const newGroups = await fetchWorkset(tab);

        // 요청한 탭이 비어있으면 다른 탭으로 자동 fallback.
        if (newGroups.length === 0) {
          const currentTabs = tabs.length > 0 ? tabs : [tab];
          for (const other of currentTabs) {
            if (other === tab) continue;
            try {
              const fallbackGroups = await fetchWorkset(other);
              if (fallbackGroups.length > 0) {
                setReadTab(other);
                setGroups(fallbackGroups);
                setReadSource("sheet");
                return fallbackGroups;
              }
            } catch {
              // skip
            }
          }
        }

        setReadTab(tab);
        setGroups(newGroups);
        setReadSource("sheet");
        return newGroups;
      } finally {
        setIsLoadingWorkset(false);
      }
    },
    [fetchWorkset, tabs],
  );

  const switchToDb = useCallback(async (): Promise<ReviewStockGroup[]> => {
    setIsLoadingWorkset(true);
    try {
      const json = await getJson<WorksetResponse>("/api/review/workset", "DB workset fetch failed");
      if (!json.groups) throw new Error("DB workset fetch failed");
      setReadSource("db");
      setGroups(json.groups);
      return json.groups;
    } finally {
      setIsLoadingWorkset(false);
    }
  }, []);

  const reloadTab = useCallback(
    async (tab: string) => {
      cacheRef.current.delete(tab);
      if (tab === readTab) setIsLoadingWorkset(true);
      try {
        const newGroups = await fetchWorkset(tab);
        if (tab === readTab) {
          setGroups(newGroups);
        }
      } finally {
        if (tab === readTab) setIsLoadingWorkset(false);
      }
    },
    [fetchWorkset, readTab],
  );

  const reloadAll = useCallback(async () => {
    cacheRef.current.clear();
    try {
      const tabsRes = await getJsonOrNull<TabsResponse>("/api/review/sheets/tabs");
      const allTabs = tabsRes?.tabs;
      if (allTabs?.length) setTabs(allTabs);

      if (readSource === "db") {
        // DB 모드 유지하며 재조회.
        const dbJson = await getJsonOrNull<WorksetResponse>("/api/review/workset");
        if (dbJson?.groups) setGroups(dbJson.groups);
      } else {
        // 현재 탭 먼저 갱신.
        const current = await fetchWorkset(readTab);
        setGroups(current);
        // 나머지 background.
        for (const tab of (allTabs ?? tabs)) {
          if (tab === readTab || cacheRef.current.has(tab)) continue;
          fetchWorkset(tab).catch(() => {});
        }
      }
    } catch {
      /* ignore */
    }
  }, [fetchWorkset, readTab, readSource, tabs]);

  // 낙관적 변이(현재 groups + 시트 모드면 현재 탭 캐시 갱신)는 useOptimisticGroups 로 분리.
  const { upsertPointLocal, removePointLocal, purgeManualKeyLocal, renameManualKeyLocal } =
    useOptimisticGroups({ setGroups, cacheRef, readSource, readTab });

  return {
    tabs,
    readTab,
    groups,
    isLoadingWorkset,
    readSource,
    switchTab,
    switchToDb,
    reloadTab,
    reloadAll,
    upsertPointLocal,
    removePointLocal,
    purgeManualKeyLocal,
    renameManualKeyLocal,
  };
}
