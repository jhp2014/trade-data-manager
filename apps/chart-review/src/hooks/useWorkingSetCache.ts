"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewStockGroup } from "@/types/review";
import {
  upsertPointInGroups,
  removePointFromGroups,
  type UpsertPointInput,
} from "@/lib/optimisticPoint";

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
      try {
        const r = await fetch("/api/review/sheets/tabs");
        if (cancelled) return;
        const { tabs: allTabs } = (await r.json()) as { tabs: string[] };
        if (!allTabs || allTabs.length === 0) return;
        setTabs(allTabs);
        // 현재 탭 제외하고 background preload.
        for (const tab of allTabs) {
          if (cancelled) break;
          if (cacheRef.current.has(tab)) continue;
          try {
            const wr = await fetch(`/api/review/workset?tab=${encodeURIComponent(tab)}`);
            if (cancelled) break;
            const { groups: g } = (await wr.json()) as { groups: ReviewStockGroup[] };
            if (g) cacheRef.current.set(tab, g);
          } catch {
            // 실패해도 이후 switchTab 때 재시도하므로 무시.
          }
        }
      } catch {
        // 탭 목록 조회 실패 시 초기 탭만 사용.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchWorkset = useCallback(async (tab: string): Promise<ReviewStockGroup[]> => {
    const r = await fetch(`/api/review/workset?tab=${encodeURIComponent(tab)}`);
    const json = (await r.json()) as { groups?: ReviewStockGroup[]; error?: string };
    if (!r.ok || !json.groups) throw new Error(json.error ?? "workset fetch failed");
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
      const r = await fetch("/api/review/workset");
      const json = (await r.json()) as { groups?: ReviewStockGroup[]; error?: string };
      if (!r.ok || !json.groups) throw new Error(json.error ?? "DB workset fetch failed");
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
      const r = await fetch("/api/review/sheets/tabs");
      const { tabs: allTabs } = (await r.json()) as { tabs: string[] };
      if (allTabs?.length) setTabs(allTabs);

      if (readSource === "db") {
        // DB 모드 유지하며 재조회.
        const dbR = await fetch("/api/review/workset");
        if (dbR.ok) {
          const dbJson = (await dbR.json()) as { groups?: ReviewStockGroup[] };
          if (dbJson.groups) setGroups(dbJson.groups);
        }
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

  // groups state 와 (시트 모드일 때) 현재 탭 캐시를 함께 갱신한다.
  // 캐시까지 갱신해야 다른 탭에 다녀와도 낙관적 변경이 유지된다.
  const applyLocal = useCallback(
    (mutate: (prev: ReviewStockGroup[]) => ReviewStockGroup[]) => {
      setGroups((prev) => {
        const next = mutate(prev);
        if (next === prev) return prev;
        if (readSource === "sheet") cacheRef.current.set(readTab, next);
        return next;
      });
    },
    [readSource, readTab],
  );

  const upsertPointLocal = useCallback(
    (input: UpsertPointInput) => applyLocal((prev) => upsertPointInGroups(prev, input)),
    [applyLocal],
  );

  const removePointLocal = useCallback(
    (reviewId: string) => applyLocal((prev) => removePointFromGroups(prev, reviewId)),
    [applyLocal],
  );

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
  };
}
