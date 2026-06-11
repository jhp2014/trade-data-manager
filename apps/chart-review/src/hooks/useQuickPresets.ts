"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type QuickPreset,
  type PresetGroup,
  PRESET_HOTKEYS,
  mergePresetIntoManual,
} from "@/lib/quickPreset";
import { isEditableTarget } from "@/lib/domFocus";
import type { ReviewStockGroup } from "@/types/review";
import type { UpsertPointInput } from "@/lib/optimisticPoint";

type UseQuickPresetsParams = {
  /** 입력 가능 종목인지(불가면 적용 거부). */
  canInput: boolean;
  /** 현재 입력 대상 종목(그룹). */
  activeGroup: ReviewStockGroup;
  /** 마커 시각 "HH:MM"(입력 대상 tradeTime). */
  markerTimeStr: string;
  /** 마커 분(누적 컨텍스트 무효화 트리거). */
  markerMinutes: number;
  /** 입력 드로어 열림 여부(누적 무효화 트리거 + 스위처 게이트). */
  inputOpen: boolean;
  /** 설정 모달 열림 여부(스위처 게이트). */
  settingsOpen: boolean;
  /** 히스토리 스위처 열림 여부(스위처 게이트). */
  switcherOpen: boolean;
  /** 숫자키 프리셋 그룹 정의(1~4). */
  quickPresetGroups: PresetGroup[];
  /** 낙관적 갱신: 적용 결과를 화면 타점에 즉시 반영. */
  upsertPointLocal: (input: UpsertPointInput) => void;
  /** 적용 결과 토스트. */
  showStatus: (message: string) => void;
};

export type UseQuickPresetsResult = {
  /** 열린 프리셋 그룹 hotkey(없으면 null). */
  presetGroupOpen: string | null;
  /** 스위처 하이라이트 인덱스. */
  presetIndex: number;
  /** 프리셋 적용(서버 반영 + 낙관적 갱신 + 누적 병합). */
  applyPreset: (preset: QuickPreset) => Promise<void>;
  /** 프리셋 스위처 닫기. */
  closePresetGroup: () => void;
};

/**
 * 퀵 입력 프리셋. 숫자키(1~4)로 그룹 스위처를 열고 w/s 순회 → Space 적용.
 * 현재 종목/마커 시각을 대상으로 한다. 같은 타깃 연속 적용 시 직전 결과 위에 누적 병합.
 */
export function useQuickPresets({
  canInput,
  activeGroup,
  markerTimeStr,
  markerMinutes,
  inputOpen,
  settingsOpen,
  switcherOpen,
  quickPresetGroups,
  upsertPointLocal,
  showStatus,
}: UseQuickPresetsParams): UseQuickPresetsResult {
  // 누적 적용용: 같은 타깃(종목·날짜·마커시각)에서 연속 적용 시 직전 결과 위에 병합.
  const pendingManualRef = useRef<{ targetKey: string; manual: Record<string, string> } | null>(
    null,
  );
  // 종목·마커·입력창 상태가 바뀌면 누적 컨텍스트 무효화(서버 기준으로 재시작).
  useEffect(() => {
    pendingManualRef.current = null;
  }, [activeGroup.stockCode, activeGroup.tradeDate, markerMinutes, inputOpen]);

  const applyPreset = useCallback(
    async (preset: QuickPreset) => {
      if (!canInput) {
        showStatus("✗ 입력할 수 없는 종목입니다");
        return;
      }
      const stockCode = activeGroup.stockCode;
      const tradeDate = activeGroup.tradeDate;
      const tradeTime = markerTimeStr;
      const targetKey = `${stockCode}|${tradeDate}|${tradeTime}`;

      // 베이스 manual: 같은 타깃 연속 적용이면 직전 결과, 아니면 마커 위치의 기존 타점값.
      let base: Record<string, string>;
      if (pendingManualRef.current && pendingManualRef.current.targetKey === targetKey) {
        base = pendingManualRef.current.manual;
      } else {
        const existing = activeGroup.points.find(
          (p) => p.reviewId && p.tradeTime.slice(0, 5) === tradeTime.slice(0, 5),
        );
        base = existing ? { ...existing.sourceRow.manual } : {};
      }

      const { payload, summary } = mergePresetIntoManual(base, preset.entries);

      // 다음 누적을 위해 결과 manual 을 문자열로 보관.
      const resultManual: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload)) {
        resultManual[k] = Array.isArray(v) ? v.join(" | ") : v;
      }
      pendingManualRef.current = { targetKey, manual: resultManual };

      const label = activeGroup.stockName ?? stockCode;
      try {
        const res = await fetch("/api/review/point", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockCode, tradeDate, tradeTime, payload }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "적용 실패");
        const { id, features } = (await res.json()) as {
          id: string;
          features?: Record<string, string>;
        };
        // 낙관적: 서버 재조회 없이 화면의 해당 타점을 즉시 갱신(서버 파생 features 포함).
        upsertPointLocal({ stockCode, tradeDate, tradeTime, reviewId: id, payload, features });
        showStatus(`✓ ${label} · ${summary || "변경 없음"}`);
      } catch (err) {
        pendingManualRef.current = null; // 실패 시 누적 무효화
        showStatus(`✗ ${err instanceof Error ? err.message : "오류"}`);
      }
    },
    [canInput, activeGroup, markerTimeStr, upsertPointLocal, showStatus],
  );

  const [presetGroupOpen, setPresetGroupOpen] = useState<string | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const presetGroupOpenRef = useRef<string | null>(null);
  const presetIndexRef = useRef(0);
  const quickPresetGroupsRef = useRef(quickPresetGroups);
  quickPresetGroupsRef.current = quickPresetGroups;
  const applyPresetRef = useRef(applyPreset);
  applyPresetRef.current = applyPreset;

  const setPresetIdx = useCallback((i: number) => {
    presetIndexRef.current = i;
    setPresetIndex(i);
  }, []);

  const openPresetGroup = useCallback((hotkey: string) => {
    presetGroupOpenRef.current = hotkey;
    setPresetGroupOpen(hotkey);
    presetIndexRef.current = 0;
    setPresetIndex(0);
  }, []);

  const closePresetGroup = useCallback(() => {
    presetGroupOpenRef.current = null;
    setPresetGroupOpen(null);
  }, []);

  // 숫자키 스위처 전역 핸들러(캡처 단계). 입력창/다른 모달이 떠 있으면 관여 안 함.
  useEffect(() => {
    const isHotkey = (k: string) => (PRESET_HOTKEYS as readonly string[]).includes(k);
    const handler = (e: KeyboardEvent) => {
      if (inputOpen || settingsOpen || switcherOpen) return;
      if (isEditableTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const groups = quickPresetGroupsRef.current;
      const openHotkey = presetGroupOpenRef.current;

      // 닫힌 상태: 1~4 로 그룹 열기(프리셋이 있을 때만).
      if (openHotkey === null) {
        if (!isHotkey(e.key)) return;
        const g = groups.find((x) => x.hotkey === e.key);
        if (!g || g.presets.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        openPresetGroup(e.key);
        return;
      }

      // 열린 상태.
      const g = groups.find((x) => x.hotkey === openHotkey);
      const len = g?.presets.length ?? 0;
      const cur = presetIndexRef.current;

      if (isHotkey(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === openHotkey) {
          if (len > 0) setPresetIdx((cur + 1) % len); // 같은 숫자 = 다음으로 순회
        } else {
          const ng = groups.find((x) => x.hotkey === e.key);
          if (ng && ng.presets.length > 0) openPresetGroup(e.key); // 다른 숫자 = 그룹 점프
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          e.stopPropagation();
          if (len > 0) setPresetIdx((cur + 1) % len);
          break;
        case "w":
          e.preventDefault();
          e.stopPropagation();
          if (len > 0) setPresetIdx((cur - 1 + len) % len);
          break;
        case " ":
        case "enter":
          e.preventDefault();
          e.stopPropagation();
          if (g && g.presets[cur]) void applyPresetRef.current(g.presets[cur]);
          closePresetGroup();
          break;
        case "escape":
          e.preventDefault();
          e.stopPropagation();
          closePresetGroup();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [inputOpen, settingsOpen, switcherOpen, openPresetGroup, closePresetGroup, setPresetIdx]);

  return { presetGroupOpen, presetIndex, applyPreset, closePresetGroup };
}
