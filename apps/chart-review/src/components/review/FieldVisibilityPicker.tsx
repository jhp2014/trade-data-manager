"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./FieldVisibilityPicker.module.css";

type FieldVisibilityPickerProps = {
  label: string;
  availableKeys: string[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onClear: () => void;
};

/** 헤더/Point List 에 노출할 필드를 고르는 작은 팝오버 (data-view OptionVisibilityPicker 참고). */
export function FieldVisibilityPicker({
  label,
  availableKeys,
  selectedKeys,
  onToggle,
  onClear,
}: FieldVisibilityPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const filtered = search
    ? availableKeys.filter((k) => k.toLowerCase().includes(search.toLowerCase()))
    : availableKeys;

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        {label}
        {selectedKeys.length > 0 && <span className={styles.badge}>{selectedKeys.length}</span>}
      </button>
      {open && (
        <div className={styles.popover}>
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
      )}
    </div>
  );
}
