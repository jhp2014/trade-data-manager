"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReviewStore, type HistoryEntry } from "@/stores/useReviewStore";
import { SWITCHER_AUTO_COMMIT_MS } from "@/lib/shortcuts";
import { isEditableTarget } from "@/lib/domFocus";

type UseHistorySwitcherParams = {
  /** 탐색 히스토리(최신순). */
  history: HistoryEntry[];
  /** 현재 차트 종목 키 `${stockCode}-${tradeDate}`. 최상단이 현재면 시작 인덱스를 1로. */
  selectedGroupKey: string;
  /** 입력 드로어가 열려 있으면 Tab 으로 스위처를 열지 않는다. */
  inputOpen: boolean;
  /** 설정 모달이 열려 있으면 Tab 으로 스위처를 열지 않는다. */
  settingsOpen: boolean;
  /** 항목 확정 시 해당 GroupId 로 이동. */
  navigateToGroupId: (code: string, date: string) => void;
};

export type UseHistorySwitcherResult = {
  switcherOpen: boolean;
  switcherIndex: number;
  /** 지정 인덱스 항목으로 확정·이동(스위처 닫힘). HistorySwitcher onPick. */
  commitSwitcher: (index: number) => void;
  /** 히스토리 1건 삭제 + 하이라이트/열림 상태 보정. */
  deleteEntry: (index: number) => void;
  /** 히스토리 전체 삭제 + 스위처 닫기. */
  clearAll: () => void;
};

/**
 * Tab 히스토리 스위처. Tab=열기, Tab/s=다음·Shift+Tab/w=이전, Space/Enter=선택,
 * Esc=취소, 2초 멈추면 현재 하이라이트로 자동 확정.
 *
 * keydown 은 캡처 단계로 전역 단축키(Space=입력 등)보다 먼저 가로채고, 처리한 키는
 * stopPropagation 으로 새지 않게 막는다. 닫힘/인덱스/히스토리는 ref 로 최신값을 유지해
 * 핸들러를 재구독하지 않는다.
 */
export function useHistorySwitcher({
  history,
  selectedGroupKey,
  inputOpen,
  settingsOpen,
  navigateToGroupId,
}: UseHistorySwitcherParams): UseHistorySwitcherResult {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherIndex, setSwitcherIndex] = useState(0);
  const switcherOpenRef = useRef(false);
  const switcherIndexRef = useRef(0);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const selectedGroupKeyRef = useRef("");
  selectedGroupKeyRef.current = selectedGroupKey;

  const setSwitcherIdx = useCallback((i: number) => {
    switcherIndexRef.current = i;
    setSwitcherIndex(i);
  }, []);

  const closeSwitcher = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    switcherOpenRef.current = false;
    setSwitcherOpen(false);
  }, []);

  const commitSwitcher = useCallback(
    (index: number) => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
      switcherOpenRef.current = false;
      setSwitcherOpen(false);
      const entry = historyRef.current[index];
      if (entry) navigateToGroupId(entry.stockCode, entry.tradeDate);
    },
    [navigateToGroupId],
  );

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(
      () => commitSwitcher(switcherIndexRef.current),
      SWITCHER_AUTO_COMMIT_MS,
    );
  }, [commitSwitcher]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 닫힌 상태: Tab 으로만 연다.
      if (!switcherOpenRef.current) {
        if (e.key !== "Tab") return;
        if (inputOpen || settingsOpen) return;
        if (isEditableTarget(e.target)) return;
        const list = historyRef.current;
        if (list.length < 1) return; // 기록 없음
        e.preventDefault();
        e.stopPropagation();
        switcherOpenRef.current = true;
        setSwitcherOpen(true);
        // 최상단이 현재 차트면 직전 항목부터, 아니면 최상단부터.
        const topKey = `${list[0].stockCode}-${list[0].tradeDate}`;
        const start = list.length >= 2 && topKey === selectedGroupKeyRef.current ? 1 : 0;
        setSwitcherIdx(start);
        scheduleCommit();
        return;
      }
      // 열린 상태: 이동/선택/취소. 처리한 키는 전역 단축키(Space=입력 등)로 새지 않게 막는다.
      const len = historyRef.current.length;
      const cur = switcherIndexRef.current;
      switch (e.key) {
        case "Tab":
          e.preventDefault();
          e.stopPropagation();
          setSwitcherIdx((cur + (e.shiftKey ? -1 : 1) + len) % len);
          scheduleCommit();
          break;
        case "s":
        case "S":
          e.preventDefault();
          e.stopPropagation();
          setSwitcherIdx((cur + 1) % len);
          scheduleCommit();
          break;
        case "w":
        case "W":
          e.preventDefault();
          e.stopPropagation();
          setSwitcherIdx((cur - 1 + len) % len);
          scheduleCommit();
          break;
        case " ":
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          commitSwitcher(cur);
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          closeSwitcher();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [inputOpen, settingsOpen, scheduleCommit, closeSwitcher, commitSwitcher, setSwitcherIdx]);

  const deleteEntry = useCallback(
    (index: number) => {
      useReviewStore.getState().removeHistory(index);
      const newLen = history.length - 1;
      if (newLen === 0) {
        closeSwitcher();
      } else {
        setSwitcherIdx(Math.min(switcherIndexRef.current, newLen - 1));
      }
    },
    [history.length, closeSwitcher, setSwitcherIdx],
  );

  const clearAll = useCallback(() => {
    useReviewStore.getState().clearHistory();
    closeSwitcher();
  }, [closeSwitcher]);

  return { switcherOpen, switcherIndex, commitSwitcher, deleteEntry, clearAll };
}
