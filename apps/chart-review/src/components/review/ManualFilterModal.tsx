"use client";

import { useState } from "react";
import styles from "./FieldChecklistModal.module.css";
import { activeFilterCount } from "@/lib/manualFilter";
import { useModalDismiss } from "@/hooks/useModalDismiss";

type ManualFilterModalProps = {
  /** m_ 키(접두사 없는 원본) → 전 그룹에서 수집한 distinct 값 목록. */
  valueSuggestions: Record<string, string[]>;
  /** 현재 필터: 키 → 선택된 값 목록. */
  filters: Record<string, string[]>;
  onToggle: (key: string, value: string) => void;
  onClear: () => void;
  onClose: () => void;
};

/** 설정 모달 위에 겹쳐 뜨는 m_ 값 필터 모달. 키별로 펼쳐 값을 체크한다. */
export function ManualFilterModal({
  valueSuggestions,
  filters,
  onToggle,
  onClear,
  onClose,
}: ManualFilterModalProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  // 캡처 단계 ESC: 상위 설정 모달보다 먼저 닫는다.
  const { overlayRef, onOverlayClick } = useModalDismiss(onClose, {
    capture: true,
    stopPropagation: true,
  });

  const keys = Object.keys(valueSuggestions).sort();
  const activeCount = activeFilterCount(filters);

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={onOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>
            m_ 필터
            {activeCount > 0 && <span className={styles.badge}>{activeCount}</span>}
          </span>
          <button type="button" className={styles.close} onClick={onClose}>✕</button>
        </div>
        <div className={styles.list}>
          {keys.length === 0 ? (
            <div className={styles.empty}>필터할 m_ 값이 없습니다</div>
          ) : (
            keys.map((key) => {
              const values = valueSuggestions[key] ?? [];
              const selected = filters[key] ?? [];
              const isOpen = expanded === key;
              return (
                <div key={key} className={styles.group}>
                  <button
                    type="button"
                    className={styles.groupHead}
                    onClick={() => setExpanded((cur) => (cur === key ? null : key))}
                  >
                    <span className={styles.groupArrow}>{isOpen ? "▾" : "▸"}</span>
                    <span className={styles.itemLabel}>{key}</span>
                    {selected.length > 0 && <span className={styles.badge}>{selected.length}</span>}
                  </button>
                  {isOpen && (
                    <div className={styles.groupValues}>
                      {values.length === 0 ? (
                        <div className={styles.empty}>값 없음</div>
                      ) : (
                        values.map((value) => (
                          <label key={value} className={styles.item}>
                            <input
                              type="checkbox"
                              checked={selected.includes(value)}
                              onChange={() => onToggle(key, value)}
                            />
                            <span className={styles.itemLabel}>{value}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {activeCount > 0 && (
          <button type="button" className={styles.clear} onClick={onClear}>
            전체 해제
          </button>
        )}
      </div>
    </div>
  );
}
