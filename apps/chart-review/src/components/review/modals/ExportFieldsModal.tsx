"use client";

import { useState } from "react";
import sheetStyles from "../SheetModal.module.css";
import { ActionModal } from "./ActionModal";

// ── 내보내기 컬럼 설정 모달 ────────────────────────────────────────────────

export function ExportFieldsModal({
  allKeys,
  selected,
  onConfirm,
  onClose,
}: {
  allKeys: string[];
  selected: string[];
  onConfirm: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<string[]>([...selected]);
  const available = allKeys.filter((k) => !current.includes(k));

  const moveUp = (i: number) => {
    if (i === 0) return;
    setCurrent((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (i: number) => {
    if (i === current.length - 1) return;
    setCurrent((prev) => {
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const remove = (i: number) => {
    setCurrent((prev) => prev.filter((_, idx) => idx !== i));
  };

  const add = (key: string) => {
    setCurrent((prev) => [...prev, key]);
  };

  return (
    <ActionModal
      title="내보내기 컬럼 설정"
      subtitle="f 키 Append · Export 에서 출력할 컬럼과 순서를 설정합니다."
      onClose={onClose}
    >
      <div className={sheetStyles.body}>
        <div className={sheetStyles.field}>
          <span className={sheetStyles.label}>내보낼 컬럼 (순서)</span>
          {current.length === 0 && (
            <span className={sheetStyles.hint}>아래에서 컬럼을 추가하세요.</span>
          )}
          {current.map((key, i) => (
            <div key={key} className={sheetStyles.fieldRow}>
              <span className={sheetStyles.fieldRowKey}>{key}</span>
              <div className={sheetStyles.fieldRowActions}>
                <button
                  type="button"
                  className={sheetStyles.reorderBtn}
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  title="위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={sheetStyles.reorderBtn}
                  onClick={() => moveDown(i)}
                  disabled={i === current.length - 1}
                  title="아래로"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={sheetStyles.removeBtn}
                  onClick={() => remove(i)}
                  title="제거"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {available.length > 0 && (
          <div className={sheetStyles.field}>
            <span className={sheetStyles.label}>추가 가능</span>
            <div className={sheetStyles.availableList}>
              {available.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={sheetStyles.addFieldBtn}
                  onClick={() => add(key)}
                >
                  + {key}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={sheetStyles.footer}>
        <button
          type="button"
          className={sheetStyles.primaryBtn}
          onClick={() => onConfirm(current)}
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
