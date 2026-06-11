"use client";

import { useState } from "react";
import styles from "./FieldChecklistModal.module.css";
import { useModalDismiss } from "@/hooks/useModalDismiss";

type FieldChecklistModalProps = {
  title: string;
  availableKeys: string[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
};

/** 설정 모달 위에 겹쳐 뜨는 필드 선택 모달 (팝오버 클리핑 회피용). */
export function FieldChecklistModal({
  title,
  availableKeys,
  selectedKeys,
  onToggle,
  onClear,
  onClose,
}: FieldChecklistModalProps) {
  const [search, setSearch] = useState("");
  // 캡처 단계 ESC: 상위 설정 모달보다 먼저 닫는다.
  const { overlayRef, onOverlayClick } = useModalDismiss(onClose, {
    capture: true,
    stopPropagation: true,
  });

  const filtered = search
    ? availableKeys.filter((k) => k.toLowerCase().includes(search.toLowerCase()))
    : availableKeys;

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={onOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>
            {title}
            {selectedKeys.length > 0 && <span className={styles.badge}>{selectedKeys.length}</span>}
          </span>
          <button type="button" className={styles.close} onClick={onClose}>✕</button>
        </div>
        {availableKeys.length >= 8 && (
          <input
            className={styles.search}
            type="text"
            placeholder="검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        )}
        <div className={styles.list}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>필드 없음</div>
          ) : (
            filtered.map((key) => (
              <label key={key} className={styles.item}>
                <input
                  type="checkbox"
                  checked={selectedKeys.includes(key)}
                  onChange={() => onToggle(key)}
                />
                <span className={styles.itemLabel}>{key}</span>
              </label>
            ))
          )}
        </div>
        {selectedKeys.length > 0 && (
          <button type="button" className={styles.clear} onClick={onClear}>
            전체 해제
          </button>
        )}
      </div>
    </div>
  );
}
