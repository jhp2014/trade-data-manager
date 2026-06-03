"use client";

import { useEffect } from "react";
import type { ReviewCommands } from "@/lib/reviewCommands";
import type { ReviewViewMode } from "@/types/review";
import { SHORTCUT_KEYS, cycleViewMode } from "@/lib/shortcuts";

type UseGlobalShortcutsOptions = {
  commands: ReviewCommands;
  viewMode: ReviewViewMode;
  /** false면 단축키를 무시한다(모달이 열려 있는 동안 등). */
  enabled: boolean;
  /** Space 키로 입력 드로어를 여는 콜백. */
  onOpenInput: () => void;
};

/**
 * 복기 전역 단축키: a/d=종목, w/s=타점, e/q=뷰 순환, Space=입력 드로어.
 *
 * 입력 요소(input/textarea/select/contentEditable)에 포커스가 있거나
 * 수정키(meta/ctrl/alt)가 눌려 있으면 타이핑·OS 단축키를 방해하지 않도록 무시한다.
 * 키→동작 매핑은 lib/shortcuts.ts(SHORTCUT_KEYS)가 단일 출처다.
 */
export function useGlobalShortcuts({
  commands,
  viewMode,
  enabled,
  onOpenInput,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!enabled) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      switch (e.key.toLowerCase()) {
        case SHORTCUT_KEYS.prevGroup:
          e.preventDefault();
          commands.prevGroup();
          break;
        case SHORTCUT_KEYS.nextGroup:
          e.preventDefault();
          commands.nextGroup();
          break;
        case SHORTCUT_KEYS.prevPoint:
          e.preventDefault();
          commands.prevPoint();
          break;
        case SHORTCUT_KEYS.nextPoint:
          e.preventDefault();
          commands.nextPoint();
          break;
        case SHORTCUT_KEYS.viewNext:
          e.preventDefault();
          commands.setViewMode(cycleViewMode(viewMode, 1));
          break;
        case SHORTCUT_KEYS.viewPrev:
          e.preventDefault();
          commands.setViewMode(cycleViewMode(viewMode, -1));
          break;
        case SHORTCUT_KEYS.openInput:
          e.preventDefault();
          onOpenInput();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commands, viewMode, enabled, onOpenInput]);
}
