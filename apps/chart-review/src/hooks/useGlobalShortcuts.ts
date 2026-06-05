"use client";

import { useEffect } from "react";
import { SHORTCUT_KEYS } from "@/lib/shortcuts";
import { isEditableTarget } from "@/lib/domFocus";

type UseGlobalShortcutsOptions = {
  /** false면 단축키를 무시한다(모달이 열려 있는 동안 등). */
  enabled: boolean;
  /** q: 이전 종목(그룹) 탐색. */
  onPrevGroup: () => void;
  /** e: 다음 종목(그룹) 탐색. */
  onNextGroup: () => void;
  /** a: 마커 시각 -1분. */
  onMarkerLeft: () => void;
  /** d: 마커 시각 +1분. */
  onMarkerRight: () => void;
  /** Shift+a: 마커 시각 -1시간. */
  onShiftMarkerLeft: () => void;
  /** Shift+d: 마커 시각 +1시간. */
  onShiftMarkerRight: () => void;
  /** Ctrl+a: 타점 탐색 위(더 과거). */
  onPrevPoint: () => void;
  /** Ctrl+d: 타점 탐색 아래(더 미래). */
  onNextPoint: () => void;
  /** w: 테마 리스트 위 종목. */
  onThemeUp: () => void;
  /** s: 테마 리스트 아래 종목. */
  onThemeDown: () => void;
  /** z: 뷰 모드 순환. */
  onCycleView: () => void;
  /** c: 본 종목으로 복귀(override 해제). */
  onResetOverride: () => void;
  /** Space: 입력 드로어. */
  onOpenInput: () => void;
  /** f: Write Tab 에 현재 종목 Append. */
  onWriteAppend: () => void;
  /** r: 읽기 탭 순환. */
  onCycleReadTab: () => void;
  /** t: KRX/NXT 가격 모드 토글. */
  onTogglePriceMode: () => void;
  /** x: 분봉 마커 중심 확대 ↔ 기본 뷰 토글. */
  onToggleMinuteZoom: () => void;
};

/**
 * 복기 전역 단축키. 키→동작 매핑은 lib/shortcuts.ts(SHORTCUT_KEYS)가 단일 출처다.
 *
 * - 입력 요소(input/textarea/select/contentEditable) 포커스 시에는 무시한다.
 * - a/d         : 마커 1분 이동 (키 누른 채로 있으면 자동 반복 → 연속 1분 이동)
 * - Shift+a/d   : 마커 1시간 이동
 * - Ctrl/Meta+a/d: 타점 탐색, 브라우저 기본 동작(전체선택/북마크 등) 차단
 * - 그 외 수정키 조합은 OS/브라우저에 양보한다.
 */
export function useGlobalShortcuts({
  enabled,
  onPrevGroup,
  onNextGroup,
  onMarkerLeft,
  onMarkerRight,
  onShiftMarkerLeft,
  onShiftMarkerRight,
  onPrevPoint,
  onNextPoint,
  onThemeUp,
  onThemeDown,
  onCycleView,
  onResetOverride,
  onOpenInput,
  onWriteAppend,
  onCycleReadTab,
  onTogglePriceMode,
  onToggleMinuteZoom,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!enabled) return;
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();

      // Ctrl/Meta + a/d = 타점 탐색. 그 외 Ctrl/Meta 조합은 건드리지 않는다.
      if (e.ctrlKey || e.metaKey) {
        if (e.altKey) return;
        if (key === SHORTCUT_KEYS.prevPoint) {
          e.preventDefault();
          onPrevPoint();
        } else if (key === SHORTCUT_KEYS.nextPoint) {
          e.preventDefault();
          onNextPoint();
        }
        return;
      }
      if (e.altKey) return;

      // Shift + a/d = 마커 1시간 이동. 그 외 Shift 조합은 무시.
      if (e.shiftKey) {
        if (key === SHORTCUT_KEYS.markerLeft) {
          e.preventDefault();
          onShiftMarkerLeft();
        } else if (key === SHORTCUT_KEYS.markerRight) {
          e.preventDefault();
          onShiftMarkerRight();
        }
        return;
      }

      // 수정키 없는 단순 키.
      switch (key) {
        case SHORTCUT_KEYS.prevGroup:
          e.preventDefault();
          onPrevGroup();
          break;
        case SHORTCUT_KEYS.nextGroup:
          e.preventDefault();
          onNextGroup();
          break;
        case SHORTCUT_KEYS.markerLeft:
          e.preventDefault();
          onMarkerLeft();
          break;
        case SHORTCUT_KEYS.markerRight:
          e.preventDefault();
          onMarkerRight();
          break;
        case SHORTCUT_KEYS.themeUp:
          e.preventDefault();
          onThemeUp();
          break;
        case SHORTCUT_KEYS.themeDown:
          e.preventDefault();
          onThemeDown();
          break;
        case SHORTCUT_KEYS.cycleView:
          e.preventDefault();
          onCycleView();
          break;
        case SHORTCUT_KEYS.resetOverride:
          e.preventDefault();
          onResetOverride();
          break;
        case SHORTCUT_KEYS.openInput:
          e.preventDefault();
          onOpenInput();
          break;
        case SHORTCUT_KEYS.writeAppend:
          e.preventDefault();
          onWriteAppend();
          break;
        case SHORTCUT_KEYS.cycleReadTab:
          e.preventDefault();
          onCycleReadTab();
          break;
        case SHORTCUT_KEYS.togglePriceMode:
          e.preventDefault();
          onTogglePriceMode();
          break;
        case SHORTCUT_KEYS.toggleMinuteZoom:
          e.preventDefault();
          onToggleMinuteZoom();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    enabled,
    onPrevGroup,
    onNextGroup,
    onMarkerLeft,
    onMarkerRight,
    onShiftMarkerLeft,
    onShiftMarkerRight,
    onPrevPoint,
    onNextPoint,
    onThemeUp,
    onThemeDown,
    onCycleView,
    onResetOverride,
    onOpenInput,
    onWriteAppend,
    onCycleReadTab,
    onTogglePriceMode,
    onToggleMinuteZoom,
  ]);
}
