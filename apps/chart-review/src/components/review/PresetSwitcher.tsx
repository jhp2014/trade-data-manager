"use client";

import { useEffect, useRef } from "react";
import styles from "./PresetSwitcher.module.css";
import {
  type PresetGroup,
  type QuickPreset,
  actionLabel,
} from "@/lib/quickPreset";

type PresetSwitcherProps = {
  group: PresetGroup;
  activeIndex: number;
  /** 적용 대상 표시(예: "삼성전자 09:32"). */
  targetLabel: string;
  onPick: (preset: QuickPreset) => void;
};

/**
 * 숫자키 그룹 스위처 오버레이. 그룹 내 모든 프리셋을 펼쳐 보여주고
 * 활성 프리셋을 강조한다. 각 항목의 컬럼·액션·값을 모두 노출한다.
 * (순회/적용/취소 키 입력은 ReviewWorkspace 의 전역 핸들러가 담당)
 */
export function PresetSwitcher({ group, activeIndex, targetLabel, onPick }: PresetSwitcherProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  // 활성 항목이 보이도록 스크롤.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>
            퀵 입력 프리셋 · 그룹 <span className={styles.hotkey}>{group.hotkey}</span>
          </span>
          <span className={styles.target}>적용 대상: {targetLabel}</span>
        </div>

        <div className={styles.list}>
          {group.presets.map((preset, idx) => {
            const active = idx === activeIndex;
            return (
              <div
                key={preset.id}
                ref={active ? activeRef : undefined}
                className={`${styles.card} ${active ? styles.cardActive : ""}`}
                onClick={() => onPick(preset)}
              >
                <div className={styles.cardHead}>
                  <span className={styles.caret}>{active ? "▶" : ""}</span>
                  <span className={styles.name}>{preset.name || "(이름 없음)"}</span>
                  <span className={styles.counter}>
                    {idx + 1}/{group.presets.length}
                  </span>
                </div>
                {preset.entries.length === 0 ? (
                  <div className={styles.emptyEntries}>(항목 없음)</div>
                ) : (
                  <div className={styles.entries}>
                    {preset.entries.map((entry, eIdx) => (
                      <div key={eIdx} className={styles.entryRow}>
                        <span className={styles.entryKey}>m_{entry.key}</span>
                        <span
                          className={`${styles.entryAction} ${styles[`action_${entry.action}`]}`}
                        >
                          {actionLabel(entry.action)}
                        </span>
                        <span className={styles.entryValue}>
                          {entry.action === "delete" ? "—" : entry.value || "(빈값)"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.footer}>
          <span>
            <kbd className={styles.kbd}>w</kbd>
            <kbd className={styles.kbd}>s</kbd> 순회 ·{" "}
            <kbd className={styles.kbd}>Space</kbd> 적용 ·{" "}
            <kbd className={styles.kbd}>Esc</kbd> 취소
          </span>
        </div>
      </div>
    </div>
  );
}
