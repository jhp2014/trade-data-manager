"use client";

import { useState } from "react";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal } from "./ActionModal";

// ── 입력 컬럼 설정 모달 ───────────────────────────────────────────────────────

export function InputKeyConfigModal({
  allKeys,
  keyOrder,
  keyDisabled,
  onConfirm,
  onClose,
}: {
  allKeys: string[];        // m_ prefix 포함
  keyOrder: string[];       // m_ prefix 포함, 현재 저장된 순서
  keyDisabled: string[];    // m_ prefix 포함, 현재 숨겨진 키
  onConfirm: (order: string[], disabled: string[]) => void;
  onClose: () => void;
}) {
  // 초기 순서: keyOrder 에 있는 것 먼저, 나머지는 뒤에 붙임.
  const buildInitial = () => {
    const ordered = keyOrder.filter((k) => allKeys.includes(k));
    const rest = allKeys.filter((k) => !ordered.includes(k));
    return [...ordered, ...rest];
  };

  const [order, setOrder] = useState<string[]>(buildInitial);
  const [disabled, setDisabled] = useState<string[]>([...keyDisabled]);

  const active = order.filter((k) => !disabled.includes(k));
  const hidden = order.filter((k) => disabled.includes(k));

  const moveUp = (key: string) => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (key: string) => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      if (i === -1 || i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const hide = (key: string) => setDisabled((prev) => [...prev, key]);
  const show = (key: string) => setDisabled((prev) => prev.filter((k) => k !== key));

  return (
    <ActionModal
      title="입력 컬럼 설정"
      subtitle="타점 입력창에서 표시할 컬럼과 순서를 설정합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        {/* 활성 컬럼 */}
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>활성 컬럼 (순서)</span>
          {active.length === 0 && (
            <span className={sheetStyles.hint}>모든 컬럼이 숨겨져 있습니다.</span>
          )}
          {active.map((key, idx) => (
              <div key={key} className={sheetStyles.inputKeyRow}>
                <span className={sheetStyles.inputKeyLabel}>{key}</span>
                <div className={sheetStyles.inputKeyActions}>
                  <button
                    type="button"
                    className={sheetStyles.reorderBtn}
                    onClick={() => moveUp(key)}
                    disabled={idx === 0}
                    title="위로"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={sheetStyles.reorderBtn}
                    onClick={() => moveDown(key)}
                    disabled={idx === active.length - 1}
                    title="아래로"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={sheetStyles.inputKeyToggleBtn}
                    onClick={() => hide(key)}
                    title="숨기기"
                  >
                    숨기기
                  </button>
                </div>
              </div>
          ))}
        </div>

        {/* 숨겨진 컬럼 */}
        {hidden.length > 0 && (
          <div className={sheetStyles.field}>
            <span className={sheetStyles.label}>숨겨진 컬럼</span>
            {hidden.map((key) => (
              <div key={key} className={sheetStyles.inputKeyRow}>
                <span className={`${sheetStyles.inputKeyLabel} ${sheetStyles.inputKeyLabelDisabled}`}>
                  {key}
                </span>
                <div className={sheetStyles.inputKeyActions}>
                  <button
                    type="button"
                    className={sheetStyles.inputKeyToggleBtn}
                    onClick={() => show(key)}
                    title="표시"
                  >
                    표시
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={sheetStyles.footer}>
        <button
          type="button"
          className={sheetStyles.primaryBtn}
          onClick={() => onConfirm(order, disabled)}
        >
          저장
        </button>
        <button type="button" className={sheetStyles.ghostBtn} onClick={onClose}>
          취소
        </button>
      </div>
    </ActionModal>
  );
}
